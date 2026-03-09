import re
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case, select
from typing import Optional

from database import get_db
from models import Transaction, Category, Account
from bnm import convert_amount

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _base_filter(q, date_from, date_to, account_id, bank=None):
    """Apply common date/account/bank filters."""
    if date_from:
        q = q.filter(Transaction.transaction_date >= date_from)
    if date_to:
        q = q.filter(Transaction.transaction_date <= date_to)
    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if bank:
        q = q.filter(Transaction.account_id.in_(
            select(Account.id).where(Account.bank == bank)
        ))
    return q


def _convert(amount: float, currency: str, target: str, date_str: str) -> float:
    """Convert amount to target currency. Returns absolute value.
    Falls back to unconverted amount if BNM API is unavailable."""
    try:
        return abs(convert_amount(abs(amount), currency, target, date_str))
    except RuntimeError:
        return abs(amount)


@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    account_id: Optional[int] = None,
    bank: Optional[str] = None,
    currency: Optional[str] = None,
):
    """Total income, expenses, transfers for period."""
    if currency:
        # Load raw transactions and convert each one
        q = db.query(Transaction).options(joinedload(Transaction.account))
        q = _base_filter(q, date_from, date_to, account_id, bank)
        txns = q.all()

        income = 0.0
        expense = 0.0
        transfer_out = 0.0
        refunds = 0.0
        count = len(txns)

        for t in txns:
            cur = t.account.currency if t.account else "MDL"
            converted = _convert(t.amount, cur, currency, t.transaction_date)
            if t.type == "income":
                income += converted
            elif t.type == "expense":
                expense += converted
            elif t.type == "refund":
                refunds += converted
            elif t.type == "transfer" and t.amount < 0:
                transfer_out += converted

        return {
            "total_income": round(income, 2),
            "total_expense": round(expense, 2),
            "total_refunds": round(refunds, 2),
            "total_transfers": round(transfer_out, 2),
            "net": round(income - expense + refunds, 2),
            "transaction_count": count,
            "currency": currency,
        }

    # Native mode — use SQL aggregation
    q = db.query(Transaction)
    q = _base_filter(q, date_from, date_to, account_id, bank)

    income = q.filter(Transaction.type == "income").with_entities(
        func.sum(Transaction.amount)
    ).scalar() or 0

    expense = q.filter(Transaction.type == "expense").with_entities(
        func.sum(Transaction.amount)
    ).scalar() or 0

    refunds = q.filter(Transaction.type == "refund").with_entities(
        func.sum(Transaction.amount)
    ).scalar() or 0

    transfer_out = q.filter(
        Transaction.type == "transfer",
        Transaction.amount < 0,
    ).with_entities(func.sum(Transaction.amount)).scalar() or 0

    count = q.count()

    # Find unique currencies in the filtered set
    currencies = [r[0] for r in db.query(Account.currency).join(Transaction).filter(
        Transaction.id.in_(q.with_entities(Transaction.id))
    ).distinct().all()]

    return {
        "total_income": round(abs(income), 2),
        "total_expense": round(abs(expense), 2),
        "total_refunds": round(abs(refunds), 2),
        "total_transfers": round(abs(transfer_out), 2),
        "net": round(income + expense + refunds, 2),
        "transaction_count": count,
        "currencies": sorted(currencies),
    }


@router.get("/by-category")
def expenses_by_category(
    db: Session = Depends(get_db),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    account_id: Optional[int] = None,
    bank: Optional[str] = None,
    currency: Optional[str] = None,
    parent_id: Optional[int] = None,
):
    """Expenses grouped by category (for pie chart).

    Without parent_id: returns top-level view (subcategories rolled up into parents).
    With parent_id: returns only direct children of that parent (drill-down).
    """
    # Build a parent lookup: category_id -> parent_id (for rolling up)
    all_cats = db.query(Category).all()
    cat_map = {c.id: c for c in all_cats}
    # Which parent categories have subcategories?
    parent_ids_with_children = {c.parent_id for c in all_cats if c.parent_id is not None}

    def _effective_id(cat_id: int | None) -> int | None:
        """Roll up subcategory to parent when viewing top-level."""
        if cat_id is None:
            return None
        cat = cat_map.get(cat_id)
        if cat and cat.parent_id is not None and parent_id is None:
            return cat.parent_id
        return cat_id

    if currency:
        q = db.query(Transaction).options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
        ).filter(Transaction.type == "expense")
        q = _base_filter(q, date_from, date_to, account_id, bank)

        if parent_id is not None:
            child_ids = [c.id for c in all_cats if c.parent_id == parent_id]
            # Include transactions assigned directly to the parent too
            q = q.filter(Transaction.category_id.in_([parent_id] + child_ids))

        txns = q.all()

        cat_totals: dict[int | None, dict] = defaultdict(lambda: {"total": 0.0, "count": 0, "name": "", "color": ""})

        for t in txns:
            cur = t.account.currency if t.account else "MDL"
            converted = _convert(t.amount, cur, currency, t.transaction_date)
            eff_id = t.category_id if parent_id is not None else _effective_id(t.category_id)
            cat_totals[eff_id]["total"] += converted
            cat_totals[eff_id]["count"] += 1
            cat = cat_map.get(eff_id) if eff_id else None
            if cat:
                cat_totals[eff_id]["name"] = cat.name
                cat_totals[eff_id]["color"] = cat.color or "#94a3b8"
            else:
                cat_totals[eff_id]["name"] = "Fără categorie"
                cat_totals[eff_id]["color"] = "#94a3b8"

        result = [
            {"category_id": cid, "name": info["name"], "color": info["color"],
             "total": round(info["total"], 2), "count": info["count"],
             "has_children": cid in parent_ids_with_children if cid else False}
            for cid, info in cat_totals.items()
            if info["total"] > 0
        ]
        result.sort(key=lambda x: x["total"], reverse=True)
        return result

    # Native mode — SQL aggregation (per individual category)
    q = db.query(
        Category.id,
        Category.name,
        Category.parent_id,
        Category.color,
        func.sum(func.abs(Transaction.amount)).label("total"),
        func.count(Transaction.id).label("count"),
    ).join(Transaction, Transaction.category_id == Category.id).filter(
        Transaction.type == "expense",
    )
    q = _base_filter(q, date_from, date_to, account_id, bank)

    if parent_id is not None:
        child_ids = [c.id for c in all_cats if c.parent_id == parent_id]
        q = q.filter(Category.id.in_([parent_id] + child_ids))

    rows = q.group_by(Category.id).all()

    if parent_id is not None:
        # Drill-down: show each child separately
        result = [
            {"category_id": r.id, "name": r.name, "color": r.color or "#94a3b8",
             "total": round(r.total, 2), "count": r.count, "has_children": False}
            for r in rows
        ]
    else:
        # Top-level: roll subcategories into parents
        merged: dict[int | None, dict] = {}
        for r in rows:
            eff_id = r.parent_id if r.parent_id is not None else r.id
            if eff_id not in merged:
                parent_cat = cat_map.get(eff_id)
                merged[eff_id] = {
                    "category_id": eff_id,
                    "name": parent_cat.name if parent_cat else r.name,
                    "color": (parent_cat.color if parent_cat else r.color) or "#94a3b8",
                    "total": 0.0,
                    "count": 0,
                    "has_children": eff_id in parent_ids_with_children,
                }
            merged[eff_id]["total"] += r.total
            merged[eff_id]["count"] += r.count

        result = [
            {**v, "total": round(v["total"], 2)}
            for v in merged.values()
        ]

    # Uncategorized (only at top level)
    if parent_id is None:
        uq = db.query(
            func.sum(func.abs(Transaction.amount)).label("total"),
            func.count(Transaction.id).label("count"),
        ).filter(
            Transaction.type == "expense",
            Transaction.category_id == None,
        )
        uq = _base_filter(uq, date_from, date_to, account_id, bank)
        uncategorized = uq.first()

        if uncategorized and uncategorized.total:
            result.append({
                "category_id": None,
                "name": "Fără categorie",
                "color": "#94a3b8",
                "total": round(uncategorized.total, 2),
                "count": uncategorized.count,
                "has_children": False,
            })

    result.sort(key=lambda x: x["total"], reverse=True)
    return result


@router.get("/by-month")
def income_expense_by_month(
    db: Session = Depends(get_db),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    account_id: Optional[int] = None,
    bank: Optional[str] = None,
    currency: Optional[str] = None,
):
    """Income vs expenses by month (for bar chart)."""
    if currency:
        q = db.query(Transaction).options(joinedload(Transaction.account)).filter(
            Transaction.type.in_(["income", "expense", "refund"])
        )
        q = _base_filter(q, date_from, date_to, account_id, bank)
        txns = q.all()

        months: dict[str, dict[str, float]] = defaultdict(lambda: {"income": 0.0, "expense": 0.0, "refund": 0.0})
        for t in txns:
            cur = t.account.currency if t.account else "MDL"
            converted = _convert(t.amount, cur, currency, t.transaction_date)
            month = t.transaction_date[:7]
            if t.type == "income":
                months[month]["income"] += converted
            elif t.type == "refund":
                months[month]["refund"] += converted
            else:
                months[month]["expense"] += converted

        return [
            {"month": m, "income": round(d["income"], 2), "expense": round(d["expense"], 2), "refund": round(d["refund"], 2)}
            for m, d in sorted(months.items())
        ]

    # Native mode
    month_expr = func.substr(Transaction.transaction_date, 1, 7)

    q = db.query(
        month_expr.label("month"),
        func.sum(case(
            (Transaction.type == "income", Transaction.amount),
            else_=0,
        )).label("income"),
        func.sum(case(
            (Transaction.type == "expense", func.abs(Transaction.amount)),
            else_=0,
        )).label("expense"),
        func.sum(case(
            (Transaction.type == "refund", Transaction.amount),
            else_=0,
        )).label("refund"),
    ).filter(Transaction.type.in_(["income", "expense", "refund"]))
    q = _base_filter(q, date_from, date_to, account_id, bank)

    rows = q.group_by(month_expr).order_by(month_expr).all()

    return [
        {"month": r.month, "income": round(r.income, 2), "expense": round(r.expense, 2), "refund": round(r.refund, 2)}
        for r in rows
    ]


@router.get("/top-expenses")
def top_expenses(
    db: Session = Depends(get_db),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    account_id: Optional[int] = None,
    bank: Optional[str] = None,
    currency: Optional[str] = None,
    limit: int = 10,
    exclude_categories: Optional[list[str]] = Query(None),
):
    """Top expenses by amount."""
    q = db.query(Transaction).options(
        joinedload(Transaction.account),
        joinedload(Transaction.category),
    ).filter(Transaction.type == "expense")
    q = _base_filter(q, date_from, date_to, account_id, bank)

    if exclude_categories:
        # Exclude transactions whose category name is in the list; keep uncategorized
        excluded_ids = db.query(Category.id).filter(Category.name.in_(exclude_categories)).subquery()
        q = q.filter(~Transaction.category_id.in_(excluded_ids) | Transaction.category_id.is_(None))

    if currency:
        # Pre-filter: load top N*10 by raw amount to avoid loading entire table
        txns = q.order_by(Transaction.amount.asc()).limit(limit * 10).all()
        items = []
        for t in txns:
            cur = t.account.currency if t.account else "MDL"
            converted = _convert(t.amount, cur, currency, t.transaction_date)
            items.append({
                "id": t.id,
                "date": t.transaction_date,
                "description": t.description,
                "amount": round(converted, 2),
                "original_amount": t.original_amount,
                "original_currency": t.original_currency,
                "category_name": t.category.name if t.category else None,
                "currency": currency,
                "note": t.note,
            })
        items.sort(key=lambda x: x["amount"], reverse=True)
        return items[:limit]

    txns = q.order_by(Transaction.amount.asc()).limit(limit).all()

    return [
        {
            "id": t.id,
            "date": t.transaction_date,
            "description": t.description,
            "amount": round(abs(t.amount), 2),
            "original_amount": t.original_amount,
            "original_currency": t.original_currency,
            "category_name": t.category.name if t.category else None,
            "note": t.note,
        }
        for t in txns
    ]


@router.get("/balance-trend")
def balance_trend(
    db: Session = Depends(get_db),
    account_id: Optional[int] = None,
):
    """Balance over time (for line chart). Only for accounts with balance_after."""
    q = db.query(
        Transaction.transaction_date,
        Transaction.balance_after,
    ).filter(
        Transaction.balance_after != None,
    )

    if account_id:
        q = q.filter(Transaction.account_id == account_id)

    rows = q.order_by(Transaction.transaction_date, Transaction.id).all()

    # Take last balance per date
    by_date = {}
    for r in rows:
        by_date[r.transaction_date] = r.balance_after

    return [{"date": d, "balance": round(b, 2)} for d, b in sorted(by_date.items())]


@router.get("/recurring")
def recurring_transactions(
    db: Session = Depends(get_db),
    account_id: Optional[int] = None,
):
    """Detect recurring expenses (same description pattern, 3+ months)."""
    q = db.query(Transaction).filter(Transaction.type == "expense")
    if account_id:
        q = q.filter(Transaction.account_id == account_id)

    txns = q.order_by(Transaction.transaction_date).all()

    # Normalize description: lowercase, strip numbers/dates, collapse whitespace
    def normalize(desc: str) -> str:
        s = desc.lower()
        # Remove dates like DD.MM.YYYY or DD/MM/YYYY
        s = re.sub(r"\d{2}[./]\d{2}[./]\d{2,4}", "", s)
        # Remove long numbers (card numbers, references)
        s = re.sub(r"\b\d{4,}\b", "", s)
        # Remove amounts like 123.45
        s = re.sub(r"\b\d+\.\d{2}\b", "", s)
        # Collapse whitespace
        s = re.sub(r"\s+", " ", s).strip()
        return s

    groups: dict[str, list] = defaultdict(list)
    for t in txns:
        key = normalize(t.description)
        if len(key) < 5:
            continue
        month = t.transaction_date[:7]  # YYYY-MM
        groups[key].append({
            "month": month,
            "amount": abs(t.amount),
            "date": t.transaction_date,
            "description": t.description,
            "currency": t.account.currency if t.account else "?",
        })

    result = []
    for key, items in groups.items():
        unique_months = set(it["month"] for it in items)
        if len(unique_months) < 3:
            continue
        amounts = [it["amount"] for it in items]
        avg_amount = sum(amounts) / len(amounts)
        # Use the most recent description as the display name
        last_item = items[-1]
        result.append({
            "description": last_item["description"],
            "currency": last_item["currency"],
            "occurrences": len(items),
            "months": len(unique_months),
            "avg_amount": round(avg_amount, 2),
            "last_date": last_item["date"],
            "last_amount": round(last_item["amount"], 2),
        })

    result.sort(key=lambda x: x["avg_amount"], reverse=True)
    return result[:20]


@router.get("/category-trend")
def category_trend(
    db: Session = Depends(get_db),
    category_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    account_id: Optional[int] = None,
    bank: Optional[str] = None,
    currency: Optional[str] = None,
):
    """Monthly expense trend for a specific category (including subcategories)."""
    if category_id is None:
        return []

    # Get category + subcategory IDs
    sub_ids = [c.id for c in db.query(Category).filter(Category.parent_id == category_id).all()]
    all_ids = [category_id] + sub_ids

    if currency:
        q = db.query(Transaction).options(joinedload(Transaction.account)).filter(
            Transaction.type == "expense",
            Transaction.category_id.in_(all_ids),
        )
        q = _base_filter(q, date_from, date_to, account_id, bank)
        txns = q.all()

        months: dict[str, float] = defaultdict(float)
        for t in txns:
            cur = t.account.currency if t.account else "MDL"
            converted = _convert(t.amount, cur, currency, t.transaction_date)
            months[t.transaction_date[:7]] += converted

        return [{"month": m, "total": round(v, 2)} for m, v in sorted(months.items())]

    month_expr = func.substr(Transaction.transaction_date, 1, 7)
    q = db.query(
        month_expr.label("month"),
        func.sum(func.abs(Transaction.amount)).label("total"),
    ).filter(
        Transaction.type == "expense",
        Transaction.category_id.in_(all_ids),
    )
    q = _base_filter(q, date_from, date_to, account_id, bank)
    rows = q.group_by(month_expr).order_by(month_expr).all()

    return [{"month": r.month, "total": round(r.total, 2)} for r in rows]


@router.get("/compare-categories")
def compare_categories(
    db: Session = Depends(get_db),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    prev_date_from: Optional[str] = None,
    prev_date_to: Optional[str] = None,
    account_id: Optional[int] = None,
    bank: Optional[str] = None,
    currency: Optional[str] = None,
):
    """Compare expenses by category between two periods side-by-side."""
    def get_by_cat(df: str | None, dt: str | None) -> dict[int | None, dict]:
        if currency:
            q = db.query(Transaction).options(
                joinedload(Transaction.account),
                joinedload(Transaction.category),
            ).filter(Transaction.type == "expense")
            q = _base_filter(q, df, dt, account_id, bank)
            txns = q.all()

            cat_totals: dict[int | None, dict] = {}
            for t in txns:
                cur = t.account.currency if t.account else "MDL"
                converted = _convert(t.amount, cur, currency, t.transaction_date)
                cid = t.category_id
                if cid not in cat_totals:
                    cat_totals[cid] = {
                        "name": t.category.name if t.category else "Fără categorie",
                        "color": (t.category.color if t.category else "#94a3b8") or "#94a3b8",
                        "total": 0.0,
                    }
                cat_totals[cid]["total"] += converted
            return cat_totals

        q = db.query(
            Category.id,
            Category.name,
            Category.color,
            func.sum(func.abs(Transaction.amount)).label("total"),
        ).join(Transaction, Transaction.category_id == Category.id).filter(
            Transaction.type == "expense",
        )
        q = _base_filter(q, df, dt, account_id, bank)
        rows = q.group_by(Category.id).all()

        result: dict[int | None, dict] = {}
        for r in rows:
            result[r.id] = {"name": r.name, "color": r.color or "#94a3b8", "total": round(r.total, 2)}

        # Uncategorized
        uq = db.query(func.sum(func.abs(Transaction.amount)).label("total")).filter(
            Transaction.type == "expense", Transaction.category_id == None,
        )
        uq = _base_filter(uq, df, dt, account_id, bank)
        uncat = uq.scalar()
        if uncat:
            result[None] = {"name": "Fără categorie", "color": "#94a3b8", "total": round(uncat, 2)}

        return result

    current = get_by_cat(date_from, date_to)
    previous = get_by_cat(prev_date_from, prev_date_to)

    # Merge all category IDs
    all_cat_ids = set(current.keys()) | set(previous.keys())

    result = []
    for cid in all_cat_ids:
        cur_data = current.get(cid, {})
        prev_data = previous.get(cid, {})
        name = cur_data.get("name") or prev_data.get("name", "?")
        color = cur_data.get("color") or prev_data.get("color", "#94a3b8")
        cur_total = round(cur_data.get("total", 0), 2)
        prev_total = round(prev_data.get("total", 0), 2)
        delta = round(cur_total - prev_total, 2)
        delta_pct = round((cur_total - prev_total) / prev_total * 100, 1) if prev_total > 0 else None

        result.append({
            "category_id": cid,
            "name": name,
            "color": color,
            "current": cur_total,
            "previous": prev_total,
            "delta": delta,
            "delta_pct": delta_pct,
        })

    result.sort(key=lambda x: x["current"], reverse=True)
    return result


@router.get("/suspect-duplicates")
def suspect_duplicates(
    db: Session = Depends(get_db),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    account_id: Optional[int] = None,
):
    """Find transactions that look like duplicates (same date, similar amount, different descriptions)."""
    q = db.query(Transaction).options(
        joinedload(Transaction.account),
        joinedload(Transaction.category),
    )
    q = _base_filter(q, date_from, date_to, account_id)
    # Exclude transfers — they naturally have pairs
    q = q.filter(Transaction.is_transfer == False)
    txns = q.order_by(Transaction.transaction_date, Transaction.id).all()

    # Group by (date, abs(amount))
    groups: dict[tuple[str, float], list] = defaultdict(list)
    for t in txns:
        key = (t.transaction_date, round(abs(t.amount), 2))
        groups[key].append(t)

    result = []
    for (date, amount), items in groups.items():
        if len(items) < 2:
            continue
        # Check that descriptions are actually different (not exact same — those were deduped)
        descs = set(t.description for t in items)
        if len(descs) < 2:
            continue

        result.append({
            "date": date,
            "amount": amount,
            "transactions": [
                {
                    "id": t.id,
                    "description": t.description,
                    "amount": t.amount,
                    "type": t.type,
                    "account_number": t.account.account_number if t.account else None,
                    "account_currency": t.account.currency if t.account else None,
                    "bank": t.account.bank if t.account else None,
                    "category_name": t.category.name if t.category else None,
                    "source_file": t.source_file,
                }
                for t in items
            ],
        })

    result.sort(key=lambda x: x["date"], reverse=True)
    return result
