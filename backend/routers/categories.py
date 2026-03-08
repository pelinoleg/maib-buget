from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List

from database import get_db
from models import Category, CategoryRule, Transaction

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class RuleCreate(BaseModel):
    pattern: str
    category_id: int
    match_type: str = "contains"  # "contains" or "regex"


class RuleUpdate(BaseModel):
    pattern: Optional[str] = None
    category_id: Optional[int] = None
    match_type: Optional[str] = None


class RuleBulkApprove(BaseModel):
    ids: List[int]


class RuleMerge(BaseModel):
    ids: List[int]
    pattern: str
    category_id: int


@router.get("")
def list_categories(db: Session = Depends(get_db)):
    from sqlalchemy import func
    categories = db.query(Category).order_by(Category.name).all()

    # Single query to get all transaction counts per category
    counts = dict(
        db.query(Transaction.category_id, func.count(Transaction.id))
        .group_by(Transaction.category_id)
        .all()
    )

    result = []
    for c in categories:
        result.append({
            "id": c.id,
            "name": c.name,
            "parent_id": c.parent_id,
            "color": c.color,
            "icon": c.icon,
            "transaction_count": counts.get(c.id, 0),
            "subcategories": [
                {
                    "id": s.id,
                    "name": s.name,
                    "color": s.color,
                    "icon": s.icon,
                    "transaction_count": counts.get(s.id, 0),
                }
                for s in c.subcategories
            ],
        })
    return result


@router.post("")
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    cat = Category(
        name=data.name,
        parent_id=data.parent_id,
        color=data.color or "#6366f1",
        icon=data.icon,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "color": cat.color, "parent_id": cat.parent_id}


@router.put("/{category_id}")
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(Category).get(category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    if data.name is not None:
        cat.name = data.name
    if data.parent_id is not None:
        cat.parent_id = data.parent_id
    if data.color is not None:
        cat.color = data.color
    if data.icon is not None:
        cat.icon = data.icon
    db.commit()
    return {"id": cat.id, "name": cat.name, "color": cat.color}


@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).get(category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    # Collect all IDs to delete: parent + subcategories
    sub_ids = [r[0] for r in db.query(Category.id).filter(Category.parent_id == category_id).all()]
    all_ids = [category_id] + sub_ids
    # Unlink transactions from parent and all subcategories
    db.query(Transaction).filter(Transaction.category_id.in_(all_ids)).update({"category_id": None}, synchronize_session="fetch")
    # Delete rules for parent and all subcategories
    db.query(CategoryRule).filter(CategoryRule.category_id.in_(all_ids)).delete(synchronize_session="fetch")
    # Delete subcategories
    db.query(Category).filter(Category.parent_id == category_id).delete(synchronize_session="fetch")
    db.delete(cat)
    db.commit()
    return {"deleted": True}


# Category rules
@router.get("/rules")
def list_rules(db: Session = Depends(get_db)):
    rules = db.query(CategoryRule).filter(CategoryRule.is_approved == True).all()
    return [
        {"id": r.id, "pattern": r.pattern, "category_id": r.category_id, "category_name": r.category.name, "match_type": r.match_type or "contains"}
        for r in rules
    ]


@router.get("/rules/pending")
def list_pending_rules(db: Session = Depends(get_db)):
    rules = (
        db.query(CategoryRule)
        .filter(CategoryRule.is_approved == False)
        .all()
    )
    result = []
    for r in rules:
        pattern = (r.pattern or "").strip()
        if len(pattern) < 2:
            # Auto-delete junk rules with empty/too-short patterns
            db.delete(r)
            continue
        # Count matching transactions
        count = _count_matching(db, pattern, r.source_example)
        result.append({
            "id": r.id,
            "pattern": r.pattern,
            "category_id": r.category_id,
            "category_name": r.category.name,
            "source_example": r.source_example,
            "match_count": count,
        })
    db.commit()
    return result


def _match_filter(pattern: str, source_example: str = None):
    """Build SQLAlchemy filter for matching transactions.

    Tries multiple strategies:
    1. Exact substring match on pattern
    2. Word-by-word match (all words of pattern must appear)
    3. If source_example provided, also try matching by source_example words
    """
    from sqlalchemy import and_, or_

    filters = []
    pattern_stripped = pattern.strip().lower()

    if pattern_stripped:
        # Strategy 1: exact substring
        filters.append(Transaction.description.ilike(f"%{pattern_stripped}%"))
        # Strategy 2: word-by-word (helps when pattern has spaces)
        words = pattern_stripped.split()
        if len(words) > 1:
            filters.append(and_(*(Transaction.description.ilike(f"%{w}%") for w in words)))

    if source_example:
        # Strategy 3: match by source_example words (3+ chars)
        ex_words = [w for w in source_example.strip().lower().split() if len(w) >= 3]
        if ex_words:
            filters.append(and_(*(Transaction.description.ilike(f"%{w}%") for w in ex_words)))

    if not filters:
        return Transaction.id < 0  # match nothing
    return or_(*filters)


def _count_matching(db: Session, pattern: str, source_example: str = None) -> int:
    from sqlalchemy import func
    return db.query(func.count(Transaction.id)).filter(_match_filter(pattern, source_example)).scalar() or 0


@router.get("/rules/{rule_id}/sample-transactions")
def sample_transactions_for_rule(rule_id: int, db: Session = Depends(get_db)):
    """Return up to 3 recent transactions matching a rule's pattern."""
    rule = db.query(CategoryRule).get(rule_id)
    if not rule or not rule.pattern or not rule.pattern.strip():
        return []
    txns = (
        db.query(Transaction)
        .filter(_match_filter(rule.pattern, rule.source_example))
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .limit(3)
        .all()
    )
    return [
        {
            "id": t.id,
            "date": t.transaction_date,
            "description": t.description,
            "amount": t.amount,
            "currency": t.account.currency if t.account else "?",
            "type": t.type,
        }
        for t in txns
    ]


@router.post("/rules")
def create_rule(data: RuleCreate, db: Session = Depends(get_db)):
    rule = CategoryRule(pattern=data.pattern, category_id=data.category_id, match_type=data.match_type, is_approved=True)
    db.add(rule)
    db.commit()

    # Apply rule to existing uncategorized transactions (skip transfers)
    if data.match_type == "regex":
        import re
        uncategorized = db.query(Transaction).filter(
            Transaction.category_id == None,
            Transaction.is_transfer == False,
        ).all()
        count = 0
        for t in uncategorized:
            if re.search(data.pattern, t.description, re.IGNORECASE):
                t.category_id = data.category_id
                count += 1
    else:
        count = db.query(Transaction).filter(
            Transaction.category_id == None,
            Transaction.is_transfer == False,
            Transaction.description.ilike(f"%{data.pattern}%"),
        ).update({"category_id": data.category_id}, synchronize_session=False)
    db.commit()

    return {"id": rule.id, "pattern": rule.pattern, "match_type": rule.match_type, "applied_to": count}


@router.patch("/rules/{rule_id}")
def update_rule(rule_id: int, data: RuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(CategoryRule).get(rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    if data.pattern is not None:
        rule.pattern = data.pattern
    if data.category_id is not None:
        rule.category_id = data.category_id
    if data.match_type is not None:
        rule.match_type = data.match_type
    db.commit()
    return {"id": rule.id, "pattern": rule.pattern, "category_id": rule.category_id, "match_type": rule.match_type or "contains"}


@router.post("/rules/{rule_id}/approve")
def approve_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(CategoryRule).get(rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    rule.is_approved = True
    db.commit()

    # Apply to existing uncategorized transactions (skip transfers)
    count = db.query(Transaction).filter(
        Transaction.category_id == None,
        Transaction.is_transfer == False,
        Transaction.description.ilike(f"%{rule.pattern}%"),
    ).update({"category_id": rule.category_id}, synchronize_session=False)
    db.commit()

    return {"id": rule.id, "applied_to": count}


@router.post("/rules/approve-bulk")
def approve_rules_bulk(data: RuleBulkApprove, db: Session = Depends(get_db)):
    total_applied = 0
    for rule_id in data.ids:
        rule = db.query(CategoryRule).get(rule_id)
        if rule and not rule.is_approved:
            rule.is_approved = True
            count = db.query(Transaction).filter(
                Transaction.category_id == None,
                Transaction.is_transfer == False,
                Transaction.description.ilike(f"%{rule.pattern}%"),
            ).update({"category_id": rule.category_id}, synchronize_session=False)
            total_applied += count
    db.commit()
    return {"approved": len(data.ids), "applied_to": total_applied}


@router.post("/rules/merge")
def merge_rules(data: RuleMerge, db: Session = Depends(get_db)):
    """Delete selected rules and create one merged approved rule."""
    db.query(CategoryRule).filter(CategoryRule.id.in_(data.ids)).delete(synchronize_session=False)
    new_rule = CategoryRule(pattern=data.pattern, category_id=data.category_id, is_approved=True)
    db.add(new_rule)
    db.commit()

    count = db.query(Transaction).filter(
        Transaction.category_id == None,
        Transaction.is_transfer == False,
        Transaction.description.ilike(f"%{data.pattern}%"),
    ).update({"category_id": data.category_id}, synchronize_session=False)
    db.commit()

    return {"id": new_rule.id, "applied_to": count}


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(CategoryRule).get(rule_id)
    if rule:
        db.delete(rule)
        db.commit()
    return {"deleted": True}
