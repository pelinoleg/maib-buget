"""Settings endpoints: upload coverage monitoring, AI prompt editor, BNM exchange rates."""
import json
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct

from database import get_db
from models import Transaction, Account, ExchangeRate

router = APIRouter(prefix="/api/settings", tags=["settings"])

AI_PROMPT_FILE = Path(__file__).resolve().parent.parent / "ai_prompt.json"
SETTINGS_FILE = Path(__file__).resolve().parent.parent / "app_settings.json"


def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, KeyError):
            pass
    return {}


def _save_settings(data: dict):
    SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _get_coverage_start() -> tuple[int, int]:
    settings = _load_settings()
    cs = settings.get("coverage_start") or os.getenv("COVERAGE_START", "2025-01")
    parts = cs.split("-")
    return int(parts[0]), int(parts[1])


@router.get("/upload-coverage")
def get_upload_coverage(db: Session = Depends(get_db)):
    """Check which bank/month combinations have transactions loaded."""
    today = date.today()
    cs_year, cs_month = _get_coverage_start()
    expected: list[str] = []
    y, m = cs_year, cs_month
    while True:
        if y > today.year or (y == today.year and m >= today.month):
            break
        expected.append(f"{y}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1

    if not expected:
        return {"banks": [], "has_warnings": False}

    # Get all monitored accounts
    monitored = db.query(Account).filter(Account.is_monitored == 1).order_by(Account.bank, Account.name).all()

    # Group by bank, build per-account coverage
    from collections import OrderedDict
    banks_map: dict[str, list] = OrderedDict()
    has_warnings = False

    for acc in monitored:
        bank_key = (acc.bank or "").upper() or "FĂRĂ BANCĂ"

        existing_months = set(
            r[0] for r in db.query(
                func.substr(Transaction.transaction_date, 1, 7)
            ).filter(
                Transaction.account_id == acc.id,
                Transaction.transaction_date >= f"{cs_year}-{cs_month:02d}-01",
            ).distinct().all()
        )

        months = {}
        for mo in expected:
            months[mo] = mo in existing_months
            if not months[mo]:
                has_warnings = True

        account_info = {
            "account_id": acc.id,
            "name": acc.name or acc.account_number,
            "currency": acc.currency,
            "account_type": acc.account_type or "checking",
            "months": months,
        }

        if bank_key not in banks_map:
            banks_map[bank_key] = []
        banks_map[bank_key].append(account_info)

    result = [{"bank": bank, "accounts": accs} for bank, accs in banks_map.items()]

    cs_year, cs_month = _get_coverage_start()
    return {"banks": result, "has_warnings": has_warnings, "coverage_start": f"{cs_year}-{cs_month:02d}"}


@router.get("/coverage-start")
def get_coverage_start():
    y, m = _get_coverage_start()
    return {"coverage_start": f"{y}-{m:02d}"}


class CoverageStartData(BaseModel):
    coverage_start: str  # "YYYY-MM"


@router.put("/coverage-start")
def set_coverage_start(data: CoverageStartData):
    parts = data.coverage_start.strip().split("-")
    if len(parts) != 2:
        from fastapi import HTTPException
        raise HTTPException(400, "Format: YYYY-MM")
    try:
        int(parts[0])
        int(parts[1])
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(400, "Format: YYYY-MM")
    settings = _load_settings()
    settings["coverage_start"] = data.coverage_start.strip()
    _save_settings(settings)
    return {"status": "ok", "coverage_start": data.coverage_start.strip()}


class AIPromptData(BaseModel):
    system_message: str
    user_prompt_template: str


@router.get("/ai-prompt")
def get_ai_prompt():
    """Get current AI prompt (custom or default)."""
    from routers.ai_analysis import DEFAULT_SYSTEM_MESSAGE, DEFAULT_USER_PROMPT_TEMPLATE

    if AI_PROMPT_FILE.exists():
        try:
            data = json.loads(AI_PROMPT_FILE.read_text(encoding="utf-8"))
            return {
                "system_message": data.get("system_message", DEFAULT_SYSTEM_MESSAGE),
                "user_prompt_template": data.get("user_prompt_template", DEFAULT_USER_PROMPT_TEMPLATE),
                "is_custom": True,
            }
        except (json.JSONDecodeError, KeyError):
            pass

    return {
        "system_message": DEFAULT_SYSTEM_MESSAGE,
        "user_prompt_template": DEFAULT_USER_PROMPT_TEMPLATE,
        "is_custom": False,
    }


@router.put("/ai-prompt")
def save_ai_prompt(data: AIPromptData):
    """Save custom AI prompt."""
    AI_PROMPT_FILE.write_text(
        json.dumps({"system_message": data.system_message, "user_prompt_template": data.user_prompt_template},
                    ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {"status": "ok"}


@router.delete("/ai-prompt")
def reset_ai_prompt():
    """Reset AI prompt to default."""
    if AI_PROMPT_FILE.exists():
        AI_PROMPT_FILE.unlink()
    return {"status": "ok"}


# --- BNM exchange rate management ---


@router.get("/exchange-rates")
def get_exchange_rates(
    currency: Optional[str] = Query(None, description="Filter by currency code (e.g. EUR, USD)"),
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    per_page: int = Query(31, ge=1, le=1500),
    db: Session = Depends(get_db),
):
    """Return exchange rates from DB, grouped by date, with optional date range filter."""
    date_query = db.query(distinct(ExchangeRate.date))
    if currency:
        date_query = date_query.filter(ExchangeRate.currency == currency.upper())
    if date_from:
        date_query = date_query.filter(ExchangeRate.date >= date_from)
    if date_to:
        date_query = date_query.filter(ExchangeRate.date <= date_to)

    total_dates = date_query.count()

    # Paginate dates (most recent first)
    dates_page = (
        date_query
        .order_by(ExchangeRate.date.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    date_list = [row[0] for row in dates_page]

    if date_list:
        rates_q = db.query(ExchangeRate).filter(ExchangeRate.date.in_(date_list))
        # Only fetch EUR/USD by default to keep response small
        if not currency:
            rates_q = rates_q.filter(ExchangeRate.currency.in_(["EUR", "USD"]))
        else:
            rates_q = rates_q.filter(ExchangeRate.currency == currency.upper())
        rates_rows = rates_q.order_by(ExchangeRate.date.desc()).all()
    else:
        rates_rows = []

    grouped: dict[str, dict[str, float]] = {}
    for r in rates_rows:
        grouped.setdefault(r.date, {})[r.currency] = r.rate

    # Fill weekend/holiday gaps by carrying forward previous day's rates (up to today only)
    if date_from and date_to and grouped:
        from datetime import datetime as dt
        start = dt.strptime(date_from, "%Y-%m-%d").date()
        end = min(dt.strptime(date_to, "%Y-%m-%d").date(), date.today())
        # Get the rate just before range start for carry-forward
        prev_rate = None
        prev_d = db.query(ExchangeRate.date).filter(
            ExchangeRate.date < date_from,
        ).order_by(ExchangeRate.date.desc()).limit(1).scalar()
        if prev_d:
            prev_rows = db.query(ExchangeRate).filter(ExchangeRate.date == prev_d)
            if not currency:
                prev_rows = prev_rows.filter(ExchangeRate.currency.in_(["EUR", "USD"]))
            else:
                prev_rows = prev_rows.filter(ExchangeRate.currency == currency.upper())
            prev_rate = {r.currency: r.rate for r in prev_rows.all()}

        d = start
        last_known = prev_rate
        while d <= end:
            ds = d.strftime("%Y-%m-%d")
            if ds in grouped:
                last_known = grouped[ds]
            elif last_known:
                grouped[ds] = dict(last_known)
            d += timedelta(days=1)

    rates_out = [
        {"date": d, "currencies": grouped[d]}
        for d in sorted(grouped.keys(), reverse=True)
    ]

    return {
        "rates": rates_out,
        "total_dates": total_dates,
        "page": page,
        "per_page": per_page,
    }


class SyncRequest(BaseModel):
    date_from: str = ""   # YYYY-MM-DD, default: 30 days ago
    date_to: str = ""     # YYYY-MM-DD, default: today
    currencies: list[str] = []  # e.g. ["EUR", "USD"], empty = all


@router.post("/exchange-rates/sync")
def sync_exchange_rates(body: SyncRequest = SyncRequest()):
    """Trigger a manual sync of BNM rates for a date range."""
    from bnm import sync_rates

    only = set(c.upper() for c in body.currencies) if body.currencies else {"EUR", "USD"}
    synced = sync_rates(
        date_from=body.date_from,
        date_to=body.date_to,
        only_currencies=only,
    )
    return {"status": "ok", "synced_dates": synced}


@router.get("/exchange-rates/summary")
def exchange_rates_summary(db: Session = Depends(get_db)):
    """Return summary info: latest rates, date range, total dates cached."""
    from sqlalchemy import func as sqlfunc

    total = db.query(sqlfunc.count(distinct(ExchangeRate.date))).scalar() or 0
    min_date = db.query(sqlfunc.min(ExchangeRate.date)).scalar()
    max_date = db.query(sqlfunc.max(ExchangeRate.date)).scalar()

    # Today's rates: latest date that is <= today
    today_str = date.today().strftime("%Y-%m-%d")
    today_date = db.query(ExchangeRate.date).filter(
        ExchangeRate.date <= today_str,
    ).order_by(ExchangeRate.date.desc()).limit(1).scalar()

    today_rates = {}
    prev_rates = {}
    if today_date:
        rows = db.query(ExchangeRate).filter(
            ExchangeRate.date == today_date,
            ExchangeRate.currency.in_(["EUR", "USD"]),
        ).all()
        for r in rows:
            today_rates[r.currency] = r.rate

        # Previous date's rates for delta
        prev_date = db.query(ExchangeRate.date).filter(
            ExchangeRate.date < today_date,
        ).order_by(ExchangeRate.date.desc()).limit(1).scalar()
        if prev_date:
            prev_rows = db.query(ExchangeRate).filter(
                ExchangeRate.date == prev_date,
                ExchangeRate.currency.in_(["EUR", "USD"]),
            ).all()
            for r in prev_rows:
                prev_rates[r.currency] = r.rate

    from bnm import get_last_sync_time

    return {
        "total_dates": total,
        "min_date": min_date,
        "max_date": max_date,
        "today_date": today_date,
        "today_rates": today_rates,
        "prev_rates": prev_rates,
        "last_sync": get_last_sync_time(),
    }


def _next_business_day() -> date:
    """Return the next business day (skip weekends)."""
    d = date.today() + timedelta(days=1)
    while d.weekday() >= 5:  # 5=Saturday, 6=Sunday
        d += timedelta(days=1)
    return d


@router.get("/exchange-rates/tomorrow")
def exchange_rates_tomorrow(db: Session = Depends(get_db)):
    """Check if BNM has published the next business day's rates yet.

    BNM usually publishes rates after ~13:00 Chisinau time.
    On Friday, this checks Monday. On weekends, also Monday.
    We verify by checking the Date attribute in the XML response.
    """
    import httpx
    import xml.etree.ElementTree as ET
    from bnm import _load_from_db, _rate_cache, _parse_bnm_xml, _save_to_db, _update_last_sync

    _load_from_db()

    next_bday = _next_business_day()
    tomorrow = next_bday.strftime("%Y-%m-%d")
    today_str = date.today().strftime("%Y-%m-%d")

    # Already cached from a previous check
    if tomorrow in _rate_cache:
        tomorrow_rates = _rate_cache[tomorrow]
    else:
        # Fetch from BNM and verify the date in XML
        tomorrow_bnm = next_bday.strftime("%d.%m.%Y")
        url = f"https://bnm.md/en/official_exchange_rates?get_xml=1&date={tomorrow_bnm}"
        try:
            resp = httpx.get(url, timeout=10)
            resp.raise_for_status()
        except (httpx.HTTPError, httpx.TimeoutException):
            return {"available": False}

        # Check actual date in response
        root = ET.fromstring(resp.content)
        response_date = root.get("Date", "")  # e.g. "07.03.2026"
        if response_date != tomorrow_bnm:
            # BNM returned a different date — tomorrow's rates not published yet
            return {"available": False}

        rates = _parse_bnm_xml(resp.content, {"EUR", "USD"})
        if not rates:
            return {"available": False}

        _rate_cache[tomorrow] = rates
        _save_to_db(tomorrow, rates)
        _update_last_sync()
        tomorrow_rates = rates

    # Get today's rates for delta
    today_rates = _rate_cache.get(today_str, {})

    result = {}
    for cur in ("EUR", "USD"):
        t_rate = tomorrow_rates.get(cur)
        if t_rate is None:
            continue
        c_rate = today_rates.get(cur)
        delta = round(t_rate - c_rate, 4) if c_rate else None
        result[cur] = {"rate": t_rate, "delta": delta}

    return {"available": True, "date": tomorrow, "rates": result}
