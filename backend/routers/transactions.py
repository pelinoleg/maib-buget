import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case, select, or_
from typing import Optional, List

from database import get_db, escape_like
from models import Transaction, Account, Category, VALID_TRANSACTION_TYPES

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("")
def list_transactions(
    db: Session = Depends(get_db),
    account_id: Optional[int] = None,
    bank: Optional[str] = None,
    category_id: Optional[str] = None,
    type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    include_transfers: bool = True,
):
    q = db.query(Transaction).options(
        joinedload(Transaction.account),
        joinedload(Transaction.category),
    )

    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if bank:
        q = q.filter(Transaction.account_id.in_(
            select(Account.id).where(Account.bank == bank)
        ))
    if category_id:
        if category_id == "none":
            q = q.filter(Transaction.category_id == None)
        else:
            cat_id = int(category_id)
            # Include all descendants recursively
            def _collect_descendants(pid: int) -> list[int]:
                children = [c.id for c in db.query(Category).filter(Category.parent_id == pid).all()]
                for cid in list(children):
                    children.extend(_collect_descendants(cid))
                return children
            all_ids = [cat_id] + _collect_descendants(cat_id)
            q = q.filter(Transaction.category_id.in_(all_ids))
    if type:
        q = q.filter(Transaction.type == type)
    if not include_transfers:
        q = q.filter(Transaction.is_transfer == False)
    if date_from:
        q = q.filter(Transaction.transaction_date >= date_from)
    if date_to:
        q = q.filter(Transaction.transaction_date <= date_to)
    if search:
        safe = escape_like(search)
        conditions = [
            Transaction.description.ilike(f"%{safe}%", escape="\\"),
            Transaction.note.ilike(f"%{safe}%", escape="\\"),
        ]
        # Allow searching by amount (e.g. "150.00" or "150")
        try:
            amount_val = float(search.replace(",", "."))
            conditions.append(func.abs(Transaction.amount) == round(amount_val, 2))
        except ValueError:
            pass
        q = q.filter(or_(*conditions))

    # Single query for count + totals
    totals_q = q.with_entities(
        func.count(Transaction.id).label("total"),
        func.sum(case((Transaction.type == "income", Transaction.amount), else_=0)).label("income"),
        func.sum(case((Transaction.type == "expense", Transaction.amount), else_=0)).label("expense"),
        func.sum(case((Transaction.type == "transfer", Transaction.amount), else_=0)).label("transfers"),
        func.sum(case((Transaction.type == "refund", Transaction.amount), else_=0)).label("refunds"),
    ).first()
    total = totals_q.total if totals_q else 0
    sum_income = round(totals_q.income or 0, 2) if totals_q else 0
    sum_expense = round(totals_q.expense or 0, 2) if totals_q else 0
    sum_transfers = round(totals_q.transfers or 0, 2) if totals_q else 0
    sum_refunds = round(totals_q.refunds or 0, 2) if totals_q else 0

    # Sorting
    if sort == "date_asc":
        order = [Transaction.transaction_date.asc(), Transaction.id.asc()]
    elif sort == "amount_desc":
        order = [Transaction.amount.desc(), Transaction.id.desc()]
    elif sort == "amount_asc":
        order = [Transaction.amount.asc(), Transaction.id.asc()]
    else:  # default: date_desc
        order = [Transaction.transaction_date.desc(), Transaction.id.desc()]

    transactions = q.order_by(*order).offset(skip).limit(limit).all()

    return {
        "total": total,
        "sum_income": sum_income,
        "sum_expense": sum_expense,
        "sum_transfers": sum_transfers,
        "sum_refunds": sum_refunds,
        "transactions": [
            {
                "id": t.id,
                "account_id": t.account_id,
                "account_number": t.account.account_number if t.account else None,
                "account_currency": t.account.currency if t.account else None,
                "bank": t.account.bank if t.account else None,
                "transaction_date": t.transaction_date,
                "processing_date": t.processing_date,
                "description": t.description,
                "original_amount": t.original_amount,
                "original_currency": t.original_currency,
                "amount": t.amount,
                "type": t.type,
                "category_id": t.category_id,
                "category_name": t.category.name if t.category else None,
                "category_color": t.category.color if t.category else None,
                "balance_after": t.balance_after,
                "commission": t.commission,
                "is_transfer": t.is_transfer,
                "linked_transaction_id": t.linked_transaction_id,
                "source_file": t.source_file,
                "note": t.note,
            }
            for t in transactions
        ],
    }


@router.patch("/{transaction_id}/category")
def update_transaction_category(
    transaction_id: int,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    txn = db.query(Transaction).get(transaction_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    txn.category_id = category_id
    db.commit()
    return {"id": txn.id, "category_id": txn.category_id}


@router.patch("/{transaction_id}/type")
def update_transaction_type(
    transaction_id: int,
    type: str = Query(...),
    db: Session = Depends(get_db),
):
    txn = db.query(Transaction).get(transaction_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    txn.type = type
    txn.is_transfer = (type == "transfer")
    db.commit()
    return {"id": txn.id, "type": txn.type}


class NoteUpdate(BaseModel):
    note: Optional[str] = None


@router.patch("/{transaction_id}/note")
def update_transaction_note(
    transaction_id: int,
    data: NoteUpdate,
    db: Session = Depends(get_db),
):
    txn = db.query(Transaction).get(transaction_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    txn.note = data.note.strip() if data.note and data.note.strip() else None
    db.commit()
    return {"id": txn.id, "note": txn.note}


# ── Update ─────────────────────────────────────────────────────────

class TransactionUpdate(BaseModel):
    account_id: Optional[int] = None
    transaction_date: Optional[str] = None
    processing_date: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[str] = None
    category_id: Optional[int] = None
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    commission: Optional[float] = None
    note: Optional[str] = None


@router.patch("/{transaction_id}")
def update_transaction(transaction_id: int, data: TransactionUpdate, db: Session = Depends(get_db)):
    txn = db.query(Transaction).get(transaction_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")

    updates = data.model_dump(exclude_unset=True)

    if "type" in updates and updates["type"] not in VALID_TRANSACTION_TYPES:
        raise HTTPException(400, f"Invalid type: {updates['type']}")
    if "account_id" in updates:
        account = db.query(Account).get(updates["account_id"])
        if not account:
            raise HTTPException(404, "Account not found")

    for field, value in updates.items():
        setattr(txn, field, value)

    if "type" in updates:
        txn.is_transfer = (updates["type"] == "transfer")

    db.commit()
    db.refresh(txn)
    return {
        "id": txn.id,
        "account_id": txn.account_id,
        "transaction_date": txn.transaction_date,
        "description": txn.description,
        "amount": txn.amount,
        "type": txn.type,
        "category_id": txn.category_id,
    }


# ── Create ──────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    account_id: int
    transaction_date: str
    description: str
    amount: float
    type: str
    processing_date: Optional[str] = None
    category_id: Optional[int] = None
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    commission: float = 0
    note: Optional[str] = None


@router.post("")
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db)):
    if data.type not in VALID_TRANSACTION_TYPES:
        raise HTTPException(400, f"Invalid type: {data.type}")
    account = db.query(Account).get(data.account_id)
    if not account:
        raise HTTPException(404, "Account not found")

    txn = Transaction(
        account_id=data.account_id,
        transaction_date=data.transaction_date,
        processing_date=data.processing_date,
        description=data.description,
        amount=data.amount,
        type=data.type,
        category_id=data.category_id,
        original_amount=data.original_amount,
        original_currency=data.original_currency,
        commission=data.commission,
        is_transfer=(data.type == "transfer"),
        hash=f"manual_{uuid.uuid4().hex}",
        note=data.note,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return {
        "id": txn.id,
        "account_id": txn.account_id,
        "transaction_date": txn.transaction_date,
        "description": txn.description,
        "amount": txn.amount,
        "type": txn.type,
    }


# ── Delete ──────────────────────────────────────────────────────────

@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    txn = db.query(Transaction).get(transaction_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    # Unlink paired transfer
    if txn.linked_transaction_id:
        linked = db.query(Transaction).get(txn.linked_transaction_id)
        if linked:
            linked.linked_transaction_id = None
    db.delete(txn)
    db.commit()
    return {"ok": True}


class BulkDeleteRequest(BaseModel):
    ids: List[int]


@router.post("/bulk-delete")
def bulk_delete_transactions(data: BulkDeleteRequest, db: Session = Depends(get_db)):
    txns = db.query(Transaction).filter(Transaction.id.in_(data.ids)).all()
    # Unlink paired transfers
    linked_ids = {t.linked_transaction_id for t in txns if t.linked_transaction_id}
    delete_ids = {t.id for t in txns}
    orphan_links = linked_ids - delete_ids
    if orphan_links:
        db.query(Transaction).filter(Transaction.id.in_(orphan_links)).update(
            {Transaction.linked_transaction_id: None}, synchronize_session=False
        )
    for txn in txns:
        db.delete(txn)
    db.commit()
    return {"ok": True, "deleted": len(txns)}


# ── Split ──────────────────────────────────────────────────────────

class SplitRequest(BaseModel):
    description: str
    amount: float  # positive
    type: Optional[str] = None
    category_id: Optional[int] = None
    note: Optional[str] = None


@router.post("/{transaction_id}/split")
def split_transaction(transaction_id: int, data: SplitRequest, db: Session = Depends(get_db)):
    original = db.query(Transaction).get(transaction_id)
    if not original:
        raise HTTPException(404, "Transaction not found")

    if data.amount <= 0:
        raise HTTPException(400, "Split amount must be positive")
    if data.amount > abs(original.amount):
        raise HTTPException(400, "Split amount must not exceed original amount")

    split_type = data.type or original.type
    if split_type not in VALID_TRANSACTION_TYPES:
        raise HTTPException(400, f"Invalid type: {split_type}")

    # Determine sign from original
    if original.amount < 0:
        split_amount = -abs(data.amount)
        original.amount = original.amount + abs(data.amount)  # closer to zero
    else:
        split_amount = abs(data.amount)
        original.amount = original.amount - abs(data.amount)  # closer to zero

    new_txn = Transaction(
        account_id=original.account_id,
        transaction_date=original.transaction_date,
        processing_date=original.processing_date,
        description=data.description,
        amount=split_amount,
        type=split_type,
        category_id=data.category_id,
        is_transfer=(split_type == "transfer"),
        hash=f"split_{uuid.uuid4().hex}",
        source_file=original.source_file,
        note=data.note,
    )
    db.add(new_txn)
    db.commit()
    db.refresh(original)
    db.refresh(new_txn)

    return {
        "original": {"id": original.id, "amount": original.amount},
        "new": {
            "id": new_txn.id,
            "description": new_txn.description,
            "amount": new_txn.amount,
            "type": new_txn.type,
            "category_id": new_txn.category_id,
        },
    }
