import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import TypeRule, Transaction

router = APIRouter(prefix="/api/type-rules", tags=["type-rules"])


class TypeRuleCreate(BaseModel):
    pattern: str
    match_type: str = "contains"
    target_type: str
    description: Optional[str] = None
    priority: int = 0


class TypeRuleUpdate(BaseModel):
    pattern: Optional[str] = None
    match_type: Optional[str] = None
    target_type: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None


@router.get("")
def list_type_rules(db: Session = Depends(get_db)):
    from sqlalchemy import func
    rules = db.query(TypeRule).order_by(TypeRule.priority.desc(), TypeRule.id).all()
    # Load descriptions once for regex rules (if any)
    has_regex = any(r.match_type == "regex" for r in rules)
    all_descs = [row[0] for row in db.query(Transaction.description).all()] if has_regex else []
    result = []
    for r in rules:
        if r.match_type == "contains":
            count = db.query(func.count(Transaction.id)).filter(
                Transaction.description.ilike(f"%{r.pattern}%")
            ).scalar() or 0
        else:
            count = sum(1 for d in all_descs if _match_rule(r, d))
        result.append({
            "id": r.id,
            "pattern": r.pattern,
            "match_type": r.match_type,
            "target_type": r.target_type,
            "description": r.description,
            "is_system": r.is_system,
            "is_active": r.is_active,
            "priority": r.priority,
            "match_count": count,
        })
    return result


@router.post("")
def create_type_rule(data: TypeRuleCreate, db: Session = Depends(get_db)):
    rule = TypeRule(
        pattern=data.pattern,
        match_type=data.match_type,
        target_type=data.target_type,
        description=data.description,
        is_system=False,
        priority=data.priority,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": rule.id, "pattern": rule.pattern}


@router.patch("/{rule_id}")
def update_type_rule(rule_id: int, data: TypeRuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(TypeRule).get(rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    if data.pattern is not None:
        rule.pattern = data.pattern
    if data.match_type is not None:
        rule.match_type = data.match_type
    if data.target_type is not None:
        rule.target_type = data.target_type
    if data.description is not None:
        rule.description = data.description
    if data.is_active is not None:
        rule.is_active = data.is_active
    if data.priority is not None:
        rule.priority = data.priority
    db.commit()
    return {"id": rule.id}


@router.delete("/{rule_id}")
def delete_type_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(TypeRule).get(rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    if rule.is_system:
        raise HTTPException(400, "Cannot delete system rule. Deactivate it instead.")
    db.delete(rule)
    db.commit()
    return {"deleted": True}


def _match_rule(rule: TypeRule, description: str) -> bool:
    """Check if a type rule matches a transaction description."""
    if rule.match_type == "regex":
        try:
            return bool(re.search(rule.pattern, description, re.IGNORECASE))
        except re.error:
            return False
    else:
        return rule.pattern.lower() in description.lower()


@router.post("/reapply")
def reapply_type_rules(db: Session = Depends(get_db)):
    """Re-classify all transactions using current type rules."""
    rules = db.query(TypeRule).filter(TypeRule.is_active == True).order_by(TypeRule.priority.desc(), TypeRule.id).all()
    transactions = db.query(Transaction).all()

    updated = 0
    for txn in transactions:
        if txn.type == "cancelled":
            continue

        new_type = None
        for rule in rules:
            if _match_rule(rule, txn.description):
                new_type = rule.target_type
                break

        if new_type is None:
            new_type = "refund" if txn.amount > 0 else "expense"

        if txn.type != new_type:
            txn.type = new_type
            txn.is_transfer = (new_type == "transfer")
            # Transfers and refunds should not have categories
            if new_type in ("transfer", "refund"):
                txn.category_id = None
            updated += 1

    db.commit()
    return {"updated": updated, "total": len(transactions)}
