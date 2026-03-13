"""Black ledger — hidden filters & transaction visibility management."""
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case
from typing import Optional, List

from database import get_db, escape_like
from models import HiddenFilter, Transaction, Category, Account

router = APIRouter(prefix="/api/hidden", tags=["hidden"])


# ── Pydantic schemas ───────────────────────────────────────────────

class HiddenFilterCreate(BaseModel):
    name: str
    match_type: str  # "contains", "regex", "category"
    pattern: Optional[str] = None
    category_id: Optional[int] = None
    is_active: bool = True


class HiddenFilterUpdate(BaseModel):
    name: Optional[str] = None
    match_type: Optional[str] = None
    pattern: Optional[str] = None
    category_id: Optional[int] = None
    is_active: Optional[bool] = None


def _filter_to_dict(f: HiddenFilter) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "match_type": f.match_type,
        "pattern": f.pattern,
        "category_id": f.category_id,
        "category_name": f.category.name if f.category else None,
        "is_active": f.is_active,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


# ── Helpers ───────────────────────────────────────────────────────

def _collect_category_ids(db: Session, root_id: int) -> list[int]:
    """Recursively collect a category and all its descendants."""
    children = [c.id for c in db.query(Category).filter(Category.parent_id == root_id).all()]
    result = [root_id]
    for cid in children:
        result.extend(_collect_category_ids(db, cid))
    return result


def _transaction_matches_filter(txn: Transaction, f: HiddenFilter, category_ids_cache: dict) -> bool:
    """Check if a single transaction matches a hidden filter."""
    if not f.is_active:
        return False
    if f.match_type == "contains" and f.pattern:
        return f.pattern.lower() in (txn.description or "").lower()
    elif f.match_type == "regex" and f.pattern:
        try:
            return bool(re.search(f.pattern, txn.description or "", re.IGNORECASE))
        except re.error:
            return False
    elif f.match_type == "category" and f.category_id:
        ids = category_ids_cache.get(f.category_id, [])
        return txn.category_id in ids
    return False


def compute_hidden_ids(db: Session) -> set[int]:
    """
    Return the set of transaction IDs that should be hidden.
    A transaction is hidden if:
      - it matches ANY active filter AND hidden_override is False
      - OR is_hidden is True AND hidden_override is False
    A transaction with hidden_override=True is NEVER hidden (force-visible).
    """
    filters = db.query(HiddenFilter).filter(HiddenFilter.is_active == True).all()
    if not filters:
        # Only manually hidden ones
        ids = db.query(Transaction.id).filter(
            Transaction.is_hidden == True,
            Transaction.hidden_override == False,
        ).all()
        return {r[0] for r in ids}

    # Build category id cache
    cat_cache: dict[int, list[int]] = {}
    for f in filters:
        if f.match_type == "category" and f.category_id and f.category_id not in cat_cache:
            cat_cache[f.category_id] = _collect_category_ids(db, f.category_id)

    # Load all transactions (id + relevant fields only)
    txns = db.query(Transaction).options(joinedload(Transaction.account)).all()

    hidden = set()
    for t in txns:
        if t.hidden_override:
            continue
        if t.is_hidden:
            hidden.add(t.id)
            continue
        for f in filters:
            if _transaction_matches_filter(t, f, cat_cache):
                hidden.add(t.id)
                break

    return hidden


# ── CRUD for filters ──────────────────────────────────────────────

@router.get("/filters")
def list_filters(db: Session = Depends(get_db)):
    filters = db.query(HiddenFilter).options(
        joinedload(HiddenFilter.category)
    ).order_by(HiddenFilter.id).all()
    return [_filter_to_dict(f) for f in filters]


@router.post("/filters")
def create_filter(data: HiddenFilterCreate, db: Session = Depends(get_db)):
    if data.match_type not in ("contains", "regex", "category"):
        raise HTTPException(400, "match_type must be 'contains', 'regex', or 'category'")
    if data.match_type in ("contains", "regex") and not data.pattern:
        raise HTTPException(400, "pattern required for contains/regex")
    if data.match_type == "category" and not data.category_id:
        raise HTTPException(400, "category_id required for category type")
    if data.match_type == "regex" and data.pattern:
        try:
            re.compile(data.pattern)
        except re.error as e:
            raise HTTPException(400, f"Invalid regex: {e}")

    f = HiddenFilter(
        name=data.name,
        match_type=data.match_type,
        pattern=data.pattern,
        category_id=data.category_id,
        is_active=data.is_active,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return _filter_to_dict(f)


@router.patch("/filters/{filter_id}")
def update_filter(filter_id: int, data: HiddenFilterUpdate, db: Session = Depends(get_db)):
    f = db.query(HiddenFilter).get(filter_id)
    if not f:
        raise HTTPException(404, "Filter not found")
    updates = data.model_dump(exclude_unset=True)
    if "match_type" in updates and updates["match_type"] not in ("contains", "regex", "category"):
        raise HTTPException(400, "Invalid match_type")
    if "pattern" in updates and updates.get("match_type", f.match_type) == "regex":
        try:
            re.compile(updates["pattern"])
        except re.error as e:
            raise HTTPException(400, f"Invalid regex: {e}")
    for k, v in updates.items():
        setattr(f, k, v)
    db.commit()
    db.refresh(f)
    return _filter_to_dict(f)


@router.delete("/filters/{filter_id}")
def delete_filter(filter_id: int, db: Session = Depends(get_db)):
    f = db.query(HiddenFilter).get(filter_id)
    if not f:
        raise HTTPException(404, "Filter not found")
    db.delete(f)
    db.commit()
    return {"ok": True}


# ── Transaction visibility toggle ─────────────────────────────────

@router.patch("/transactions/{transaction_id}/toggle")
def toggle_transaction_visibility(transaction_id: int, db: Session = Depends(get_db)):
    """
    Toggle hidden_override for a transaction that was caught by a filter.
    If override=True → force visible in main UI.
    If override=False → follow filter rules.
    """
    t = db.query(Transaction).get(transaction_id)
    if not t:
        raise HTTPException(404, "Transaction not found")
    t.hidden_override = not t.hidden_override
    db.commit()
    return {"id": t.id, "hidden_override": t.hidden_override, "is_hidden": t.is_hidden}


@router.patch("/transactions/{transaction_id}/manual-hide")
def manual_hide_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Manually hide a specific transaction (no filter needed)."""
    t = db.query(Transaction).get(transaction_id)
    if not t:
        raise HTTPException(404, "Transaction not found")
    t.is_hidden = True
    t.hidden_override = False
    db.commit()
    return {"id": t.id, "is_hidden": t.is_hidden}


@router.patch("/transactions/{transaction_id}/manual-show")
def manual_show_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Remove manual hide from a transaction."""
    t = db.query(Transaction).get(transaction_id)
    if not t:
        raise HTTPException(404, "Transaction not found")
    t.is_hidden = False
    t.hidden_override = False
    db.commit()
    return {"id": t.id, "is_hidden": t.is_hidden}


# ── Black ledger list ─────────────────────────────────────────────

@router.get("/transactions")
def list_hidden_transactions(
    db: Session = Depends(get_db),
    year: Optional[int] = None,
    month: Optional[int] = None,
):
    """Return all transactions that are currently hidden (via filter or manually)."""
    hidden_ids = compute_hidden_ids(db)
    if not hidden_ids:
        return {"transactions": [], "total": 0, "sum_expense": 0, "sum_income": 0}

    q = db.query(Transaction).options(
        joinedload(Transaction.account),
        joinedload(Transaction.category),
    ).filter(Transaction.id.in_(hidden_ids))

    if year:
        q = q.filter(Transaction.transaction_date.startswith(str(year)))
    if month and year:
        month_str = f"{year}-{month:02d}"
        q = q.filter(Transaction.transaction_date.startswith(month_str))

    q = q.order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
    txns = q.all()

    # Also load active filters to know WHICH filter caught each transaction
    filters = db.query(HiddenFilter).filter(HiddenFilter.is_active == True).all()
    cat_cache: dict[int, list[int]] = {}
    for f in filters:
        if f.match_type == "category" and f.category_id and f.category_id not in cat_cache:
            cat_cache[f.category_id] = _collect_category_ids(db, f.category_id)

    def _matched_filter(t: Transaction) -> dict | None:
        if t.is_hidden and not t.hidden_override:
            return {"id": None, "name": "Ascuns manual", "match_type": "manual"}
        for f in filters:
            if _transaction_matches_filter(t, f, cat_cache):
                return {"id": f.id, "name": f.name, "match_type": f.match_type}
        return None

    result = []
    for t in txns:
        matched = _matched_filter(t)
        result.append({
            "id": t.id,
            "account_id": t.account_id,
            "account_number": t.account.account_number if t.account else None,
            "account_currency": t.account.currency if t.account else None,
            "bank": t.account.bank if t.account else None,
            "transaction_date": t.transaction_date,
            "description": t.description,
            "original_amount": t.original_amount,
            "original_currency": t.original_currency,
            "amount": t.amount,
            "type": t.type,
            "category_id": t.category_id,
            "category_name": t.category.name if t.category else None,
            "category_color": t.category.color if t.category else None,
            "is_hidden": t.is_hidden,
            "hidden_override": t.hidden_override,
            "matched_filter": matched,
            "note": t.note,
        })

    sum_expense = round(sum(abs(t["amount"]) for t in result if t["type"] == "expense"), 2)
    sum_income = round(sum(t["amount"] for t in result if t["type"] == "income"), 2)

    return {
        "transactions": result,
        "total": len(result),
        "sum_expense": sum_expense,
        "sum_income": sum_income,
    }


# ── Preview: which transactions would be caught by a filter ───────

@router.post("/filters/preview")
def preview_filter(data: HiddenFilterCreate, db: Session = Depends(get_db)):
    """Preview how many transactions a filter would catch (before saving)."""
    if data.match_type == "regex" and data.pattern:
        try:
            re.compile(data.pattern)
        except re.error as e:
            raise HTTPException(400, f"Invalid regex: {e}")

    cat_cache: dict[int, list[int]] = {}
    if data.match_type == "category" and data.category_id:
        cat_cache[data.category_id] = _collect_category_ids(db, data.category_id)

    f = HiddenFilter(
        name=data.name,
        match_type=data.match_type,
        pattern=data.pattern,
        category_id=data.category_id,
        is_active=True,
    )

    txns = db.query(Transaction).all()
    matched = [t for t in txns if _transaction_matches_filter(t, f, cat_cache)]
    return {
        "count": len(matched),
        "examples": [{"id": t.id, "description": t.description, "amount": t.amount, "date": t.transaction_date} for t in matched[:5]],
    }
