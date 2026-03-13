"""Salary adjustments — hide part of income from main stats."""
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from database import get_db
from models import Transaction, Account, IncomeAdjustment

router = APIRouter(prefix="/api/salary", tags=["salary"])

# Default pattern to identify salary transactions
DEFAULT_SALARY_PATTERN = "salariu oleg"


def _get_salary_pattern(db: Session) -> str:
    """Return current salary pattern (could later be stored in settings)."""
    return DEFAULT_SALARY_PATTERN


def _is_salary(description: str, pattern: str) -> bool:
    return pattern.lower() in description.lower()


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
    pattern: Optional[str] = None,
):
    """Return all salary transactions with their adjustments."""
    sal_pattern = pattern or _get_salary_pattern(db)

    q = db.query(Transaction).options(joinedload(Transaction.account)).filter(
        Transaction.type == "income",
        Transaction.is_transfer == False,
    )
    if year:
        q = q.filter(Transaction.transaction_date.startswith(str(year)))

    txns = q.order_by(Transaction.transaction_date.desc()).all()
    # Filter by pattern in Python (case-insensitive)
    txns = [t for t in txns if _is_salary(t.description, sal_pattern)]

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
            "adjusted_amount": round(t.amount + adj, 2) if adj is not None else None,
        })

    return {"transactions": result, "pattern": sal_pattern}


@router.get("/pattern")
def get_pattern(db: Session = Depends(get_db)):
    return {"pattern": _get_salary_pattern(db)}


class AdjustmentUpsert(BaseModel):
    transaction_id: int
    adjustment: float  # e.g. -300
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
