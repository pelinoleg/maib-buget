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
    priority: int = 1  # 1-10


class RuleUpdate(BaseModel):
    pattern: Optional[str] = None
    category_id: Optional[int] = None
    match_type: Optional[str] = None
    priority: Optional[int] = None


class RuleBulkApprove(BaseModel):
    ids: List[int]


class RuleMerge(BaseModel):
    ids: List[int]
    pattern: str
    category_id: int


@router.get("")
def list_categories(db: Session = Depends(get_db)):
    from sqlalchemy import func
    categories = db.query(Category).order_by(Category.id).all()

    # Single query to get all transaction counts per category
    counts = dict(
        db.query(Transaction.category_id, func.count(Transaction.id))
        .group_by(Transaction.category_id)
        .all()
    )

    def _build_tree(cat: Category) -> dict:
        return {
            "id": cat.id,
            "name": cat.name,
            "parent_id": cat.parent_id,
            "color": cat.color,
            "icon": cat.icon,
            "transaction_count": counts.get(cat.id, 0),
            "subcategories": [_build_tree(s) for s in cat.subcategories],
        }

    result = [_build_tree(c) for c in categories if c.parent_id is None]
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

    # Collect all descendant IDs recursively
    def _collect_ids(parent_id: int) -> list[int]:
        children = db.query(Category.id).filter(Category.parent_id == parent_id).all()
        ids = [r[0] for r in children]
        for child_id in list(ids):
            ids.extend(_collect_ids(child_id))
        return ids

    all_ids = [category_id] + _collect_ids(category_id)
    # Unlink transactions
    db.query(Transaction).filter(Transaction.category_id.in_(all_ids)).update({"category_id": None}, synchronize_session="fetch")
    # Delete rules
    db.query(CategoryRule).filter(CategoryRule.category_id.in_(all_ids)).delete(synchronize_session="fetch")
    # Delete all descendants then self
    db.query(Category).filter(Category.id.in_(all_ids)).delete(synchronize_session="fetch")
    db.commit()
    return {"deleted": True}


# Category rules
@router.get("/rules")
def list_rules(db: Session = Depends(get_db)):
    rules = db.query(CategoryRule).filter(CategoryRule.is_approved == True).all()
    return [
        {"id": r.id, "pattern": r.pattern, "category_id": r.category_id, "category_name": r.category.name, "match_type": r.match_type or "contains", "priority": r.priority or 1}
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


@router.post("/rules/preview")
def preview_rule(data: RuleCreate, db: Session = Depends(get_db)):
    """Preview how many transactions a category rule would match (before saving)."""
    import re as _re
    if data.match_type == "regex":
        try:
            _re.compile(data.pattern)
        except _re.error as e:
            raise HTTPException(400, f"Invalid regex: {e}")
        txns = db.query(Transaction).filter(
            Transaction.is_transfer == False,
        ).all()
        matched = [t for t in txns if _re.search(data.pattern, t.description or "", _re.IGNORECASE)]
    else:
        matched = db.query(Transaction).filter(
            Transaction.is_transfer == False,
            Transaction.description.ilike(f"%{data.pattern}%"),
        ).all()
    return {
        "count": len(matched),
        "uncategorized": sum(1 for t in matched if t.category_id is None),
        "examples": [
            {"id": t.id, "description": t.description, "amount": t.amount, "date": t.transaction_date}
            for t in sorted(matched, key=lambda t: t.transaction_date, reverse=True)[:50]
        ],
    }


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
    rule = CategoryRule(pattern=data.pattern, category_id=data.category_id, match_type=data.match_type, priority=data.priority, is_approved=True)
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

    return {"id": rule.id, "pattern": rule.pattern, "match_type": rule.match_type, "priority": rule.priority or 1, "applied_to": count}


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
    if data.priority is not None:
        rule.priority = data.priority
    db.commit()
    return {"id": rule.id, "pattern": rule.pattern, "category_id": rule.category_id, "match_type": rule.match_type or "contains", "priority": rule.priority or 1}


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
