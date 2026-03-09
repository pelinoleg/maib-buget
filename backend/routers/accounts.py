from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import Account, Transaction, Upload

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

VALID_ACCOUNT_TYPES = {"checking", "card", "cash", "savings", "investment", "other"}


@router.get("")
def list_accounts(db: Session = Depends(get_db)):
    accounts = db.query(Account).all()

    # Single aggregated query for all accounts
    stats_q = db.query(
        Transaction.account_id,
        func.count(Transaction.id).label("cnt"),
        func.sum(case((Transaction.type == "income", Transaction.amount), else_=0)).label("income"),
        func.sum(case((Transaction.type == "expense", Transaction.amount), else_=0)).label("expense"),
        func.sum(case(
            (Transaction.type == "transfer", case((Transaction.amount > 0, Transaction.amount), else_=0)),
            else_=0,
        )).label("transfers_in"),
        func.sum(case(
            (Transaction.type == "transfer", case((Transaction.amount < 0, Transaction.amount), else_=0)),
            else_=0,
        )).label("transfers_out"),
        func.min(Transaction.transaction_date).label("date_from"),
        func.max(Transaction.transaction_date).label("date_to"),
    ).group_by(Transaction.account_id).all()

    stats_map = {
        row.account_id: row for row in stats_q
    }

    # Last balance per account
    last_balances: dict[int, float | None] = {}
    for a in accounts:
        s = stats_map.get(a.id)
        if not s:
            continue
        last_txn = db.query(Transaction.balance_after).filter(
            Transaction.account_id == a.id,
            Transaction.balance_after.isnot(None),
        ).order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).first()
        if last_txn:
            last_balances[a.id] = last_txn[0]

    result = []
    for a in accounts:
        s = stats_map.get(a.id)
        result.append({
            "id": a.id,
            "account_number": a.account_number,
            "iban": a.iban,
            "currency": a.currency,
            "name": a.name,
            "description": a.description,
            "bank": a.bank,
            "account_type": a.account_type or "checking",
            "is_monitored": bool(a.is_monitored),
            "transaction_count": s.cnt if s else 0,
            "total_income": round(s.income or 0, 2) if s else 0,
            "total_expense": round(abs(s.expense or 0), 2) if s else 0,
            "total_transfers_in": round(s.transfers_in or 0, 2) if s else 0,
            "total_transfers_out": round(abs(s.transfers_out or 0), 2) if s else 0,
            "last_balance": last_balances.get(a.id),
            "date_from": s.date_from if s else None,
            "date_to": s.date_to if s else None,
        })
    return result


class AccountCreate(BaseModel):
    account_number: str
    currency: str
    name: Optional[str] = None
    description: Optional[str] = None
    bank: Optional[str] = None
    iban: Optional[str] = None
    account_type: str = "checking"
    is_monitored: bool = True


@router.post("")
def create_account(data: AccountCreate, db: Session = Depends(get_db)):
    if data.account_type not in VALID_ACCOUNT_TYPES:
        raise HTTPException(400, f"Invalid account type: {data.account_type}")
    existing = db.query(Account).filter(Account.account_number == data.account_number).first()
    if existing:
        raise HTTPException(400, "Account number already exists")
    acc = Account(
        account_number=data.account_number,
        currency=data.currency,
        name=data.name,
        description=data.description,
        bank=data.bank,
        iban=data.iban,
        account_type=data.account_type,
        is_monitored=1 if data.is_monitored else 0,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return {"id": acc.id, "account_number": acc.account_number, "currency": acc.currency, "name": acc.name, "bank": acc.bank, "account_type": acc.account_type}


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    bank: Optional[str] = None
    iban: Optional[str] = None
    currency: Optional[str] = None
    account_type: Optional[str] = None
    is_monitored: Optional[bool] = None


@router.patch("/{account_id}")
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db)):
    acc = db.query(Account).get(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")

    updates = data.model_dump(exclude_unset=True)
    if "account_type" in updates and updates["account_type"] not in VALID_ACCOUNT_TYPES:
        raise HTTPException(400, f"Invalid account type: {updates['account_type']}")

    for field, value in updates.items():
        if field == "is_monitored":
            value = 1 if value else 0
        setattr(acc, field, value)

    db.commit()
    db.refresh(acc)
    return {"id": acc.id, "name": acc.name, "description": acc.description, "bank": acc.bank, "account_type": acc.account_type, "is_monitored": bool(acc.is_monitored)}


class MergeRequest(BaseModel):
    source_ids: list[int]


@router.post("/{target_id}/merge")
def merge_accounts(target_id: int, data: MergeRequest, db: Session = Depends(get_db)):
    target = db.query(Account).get(target_id)
    if not target:
        raise HTTPException(404, "Target account not found")

    if target_id in data.source_ids:
        raise HTTPException(400, "Target account cannot be in source list")

    if not data.source_ids:
        raise HTTPException(400, "No source accounts provided")

    source_accounts = db.query(Account).filter(Account.id.in_(data.source_ids)).all()
    if len(source_accounts) != len(data.source_ids):
        found_ids = {a.id for a in source_accounts}
        missing = [sid for sid in data.source_ids if sid not in found_ids]
        raise HTTPException(404, f"Source accounts not found: {missing}")

    for sa in source_accounts:
        if sa.currency != target.currency:
            raise HTTPException(400, f"Currency mismatch: account '{sa.name}' has {sa.currency}, target has {target.currency}")

    # Move transactions
    moved = db.query(Transaction).filter(Transaction.account_id.in_(data.source_ids)).update(
        {Transaction.account_id: target_id}, synchronize_session="fetch"
    )

    # Update uploads
    source_account_numbers = [sa.account_number for sa in source_accounts]
    db.query(Upload).filter(Upload.account_number.in_(source_account_numbers)).update(
        {Upload.account_number: target.account_number}, synchronize_session="fetch"
    )

    # Delete source accounts
    for sa in source_accounts:
        db.delete(sa)

    db.commit()

    return {
        "ok": True,
        "moved_transactions": moved,
        "deleted_accounts": len(source_accounts),
    }


@router.delete("/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(Account).get(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    txn_count = db.query(Transaction).filter(Transaction.account_id == acc.id).count()
    if txn_count > 0:
        raise HTTPException(400, f"Cannot delete account with {txn_count} transactions. Delete transactions first.")
    db.delete(acc)
    db.commit()
    return {"ok": True}
