"""Salary adjustments — hide part of income from main stats."""
import re
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List

from database import get_db
from models import Transaction, Account, IncomeAdjustment

router = APIRouter(prefix="/api/salary", tags=["salary"])


def _matches_any(description: str, patterns: list[dict]) -> bool:
    """Check if description matches any pattern in the list."""
    for p in patterns:
        match_type = p.get("match_type", "contains")
        text = p.get("text", "")
        if not text:
            continue
        try:
            if match_type == "regex":
                if re.search(text, description, re.IGNORECASE):
                    return True
            else:
                if text.lower() in description.lower():
                    return True
        except re.error:
            pass
    return False


def _adjustments_map(db: Session) -> dict[int, float]:
    """Return {transaction_id: adjustment} for all saved adjustments."""
    rows = db.query(IncomeAdjustment).all()
    return {r.transaction_id: r.adjustment for r in rows}


# ── Public helper used by dashboard/transactions ────────────────────

def get_adjustments_map(db: Session) -> dict[int, float]:
    return _adjustments_map(db)


# ── API ─────────────────────────────────────────────────────────────

@router.get("/transactions")
def list_salary_transactions(
    db: Session = Depends(get_db),
    year: Optional[int] = None,
    patterns: Optional[str] = None,  # JSON array: [{"text": "...", "match_type": "contains"|"regex"}]
):
    """Return all salary transactions matched by any of the given patterns."""
    try:
        parsed_patterns = json.loads(patterns) if patterns else []
    except (json.JSONDecodeError, TypeError):
        parsed_patterns = []

    q = db.query(Transaction).options(joinedload(Transaction.account)).filter(
        Transaction.type == "income",
        Transaction.is_transfer == False,
    )
    if year:
        q = q.filter(Transaction.transaction_date.startswith(str(year)))

    txns = q.order_by(Transaction.transaction_date.desc()).all()

    if parsed_patterns:
        txns = [t for t in txns if _matches_any(t.description, parsed_patterns)]

    adj_map = _adjustments_map(db)

    result = []
    for t in txns:
        adj = adj_map.get(t.id)
        result.append({
            "id": t.id,
            "transaction_date": t.transaction_date,
            "description": t.description,
            "amount": t.amount,
            "currency": t.account.currency if t.account else None,
            "account_name": t.account.name if t.account else None,
            "adjustment": adj,
            # adjustment is always a deduction — stored as negative
            "adjusted_amount": round(t.amount + adj, 2) if adj is not None else None,
        })

    return {"transactions": result}


class AdjustmentUpsert(BaseModel):
    transaction_id: int
    adjustment: float  # always stored as negative (deduction)
    note: Optional[str] = None


@router.post("/adjustment")
def upsert_adjustment(data: AdjustmentUpsert, db: Session = Depends(get_db)):
    txn = db.query(Transaction).get(data.transaction_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    if txn.type != "income":
        raise HTTPException(400, "Only income transactions can have adjustments")

    existing = db.query(IncomeAdjustment).filter(
        IncomeAdjustment.transaction_id == data.transaction_id
    ).first()

    if existing:
        existing.adjustment = data.adjustment
        existing.note = data.note
    else:
        db.add(IncomeAdjustment(
            transaction_id=data.transaction_id,
            adjustment=data.adjustment,
            note=data.note,
        ))
    db.commit()
    return {
        "transaction_id": data.transaction_id,
        "adjustment": data.adjustment,
        "adjusted_amount": round(txn.amount + data.adjustment, 2),
    }


@router.delete("/adjustment/{transaction_id}")
def delete_adjustment(transaction_id: int, db: Session = Depends(get_db)):
    row = db.query(IncomeAdjustment).filter(
        IncomeAdjustment.transaction_id == transaction_id
    ).first()
    if not row:
        raise HTTPException(404, "Adjustment not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
