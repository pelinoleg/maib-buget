"""BNM (National Bank of Moldova) exchange rate utilities.

Rates are persisted in the exchange_rates DB table so they survive restarts.
On cold start, all stored rates are loaded into memory. BNM API is only called
for dates not yet cached. If BNM is unreachable, the nearest cached rate is used.
"""
import json
import logging
import time
import httpx
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# --- BNM settings (online/offline mode) ---
BNM_SETTINGS_FILE = Path(__file__).resolve().parent / "bnm_settings.json"


def _read_settings() -> dict:
    """Read BNM settings from JSON file."""
    if BNM_SETTINGS_FILE.exists():
        try:
            return json.loads(BNM_SETTINGS_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {"bnm_mode": "online"}


def _write_settings(data: dict) -> None:
    """Write BNM settings to JSON file."""
    BNM_SETTINGS_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_bnm_mode() -> str:
    """Return current BNM mode: 'online' or 'offline'."""
    return _read_settings().get("bnm_mode", "online")


def set_bnm_mode(mode: str) -> None:
    """Save BNM mode ('online' or 'offline')."""
    settings = _read_settings()
    settings["bnm_mode"] = mode
    _write_settings(settings)


def get_last_sync_time() -> str | None:
    """Return ISO timestamp of last successful BNM API fetch, or None."""
    return _read_settings().get("last_sync")


def _update_last_sync() -> None:
    """Update last_sync timestamp to now."""
    settings = _read_settings()
    settings["last_sync"] = datetime.now(timezone.utc).isoformat()
    _write_settings(settings)

# In-memory cache: {date_str: {currency: rate_in_mdl}}
_rate_cache: dict[str, dict[str, float]] = {}
_db_loaded = False

# Throttle: don't retry BNM API for 60s after a failure
_last_api_failure: float = 0
_API_COOLDOWN = 60  # seconds


def _load_from_db() -> None:
    """Load all exchange rates from DB into memory cache (once)."""
    global _db_loaded
    if _db_loaded:
        return
    _db_loaded = True
    try:
        from database import SessionLocal
        from models import ExchangeRate
        db = SessionLocal()
        try:
            rows = db.query(ExchangeRate).all()
            for r in rows:
                _rate_cache.setdefault(r.date, {})[r.currency] = r.rate
            if rows:
                logger.info("Loaded %d exchange rate records from DB (%d dates)",
                            len(rows), len(_rate_cache))
        finally:
            db.close()
    except Exception as e:
        logger.warning("Could not load exchange rates from DB: %s", e)


def _save_to_db(date_str: str, rates: dict[str, float]) -> None:
    """Persist rates for a date to the DB."""
    try:
        from database import SessionLocal
        from models import ExchangeRate
        db = SessionLocal()
        try:
            existing = {r.currency for r in
                        db.query(ExchangeRate.currency).filter(ExchangeRate.date == date_str).all()}
            new_records = []
            for currency, rate in rates.items():
                if currency not in existing:
                    new_records.append(ExchangeRate(date=date_str, currency=currency, rate=rate))
            if new_records:
                db.add_all(new_records)
                db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning("Could not save exchange rates to DB: %s", e)


def _find_nearest_cached(date_str: str) -> dict[str, float] | None:
    """Find the most recent cached rates on or before the given date."""
    if not _rate_cache:
        return None
    dates = sorted(_rate_cache.keys(), reverse=True)
    for d in dates:
        if d <= date_str:
            return _rate_cache[d]
    # All cached dates are after the requested date — return the earliest
    return _rate_cache.get(dates[-1])


def _fetch_from_api(date_str: str) -> dict[str, float] | None:
    """Try to fetch rates from BNM API for a single date.
    Returns rates dict or None on failure. Respects cooldown."""
    global _last_api_failure

    if time.time() - _last_api_failure < _API_COOLDOWN:
        return None

    d = datetime.strptime(date_str, "%Y-%m-%d")
    bnm_date = d.strftime("%d.%m.%Y")
    url = f"https://bnm.md/en/official_exchange_rates?get_xml=1&date={bnm_date}"

    try:
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException) as e:
        _last_api_failure = time.time()
        logger.warning("BNM API unavailable for %s: %s (cooldown %ds)", date_str, e, _API_COOLDOWN)
        return None

    rates = _parse_bnm_xml(resp.content)

    if rates:
        _rate_cache[date_str] = rates
        _save_to_db(date_str, rates)
        _update_last_sync()

    return rates or None


def fetch_bnm_rates(date_str: str) -> dict[str, float]:
    """Fetch BNM exchange rates for a given date (YYYY-MM-DD).
    Returns dict like {"EUR": 20.1648, "USD": 17.3326}.
    Rates are MDL per 1 unit of foreign currency.

    Strategy (local-first, never blocks on BNM):
    1. Check in-memory cache (exact date)
    2. Load DB cache on first call
    3. If exact date not cached — try BNM API (with cooldown)
    4. Always fall back to nearest cached date if API fails/skipped
    """
    _load_from_db()

    # 1. Exact date in cache — instant
    if date_str in _rate_cache:
        return _rate_cache[date_str]

    # 2. Try API (non-blocking: respects cooldown + offline mode)
    api_result = _fetch_from_api(date_str)
    if api_result:
        return api_result

    # 3. Fallback to nearest cached date — always works if we have any data
    fallback = _find_nearest_cached(date_str)
    if fallback:
        return fallback

    raise RuntimeError(f"No exchange rates available for {date_str} (cache empty)")


def get_today_rates() -> dict[str, float]:
    """Get BNM rates for today."""
    return fetch_bnm_rates(date.today().strftime("%Y-%m-%d"))


def _parse_bnm_xml(content: bytes, only_currencies: set[str] | None = None) -> dict[str, float]:
    """Parse BNM XML response into rates dict, optionally filtering currencies."""
    root = ET.fromstring(content)
    rates: dict[str, float] = {}
    for valute in root.findall("Valute"):
        char_code = valute.findtext("CharCode", "")
        if only_currencies and char_code not in only_currencies:
            continue
        nominal = float(valute.findtext("Nominal", "1"))
        value = float(valute.findtext("Value", "0"))
        if char_code and value > 0:
            rates[char_code] = value / nominal
    return rates


def sync_rates(
    date_from: str = "",
    date_to: str = "",
    only_currencies: set[str] | None = None,
    on_progress: callable = None,
) -> int:
    """Fetch BNM rates for a date range that aren't cached yet.

    Ignores the offline mode setting — this is an explicit manual sync.
    Returns the count of newly fetched dates.
    Stops after 3 consecutive API failures.
    """
    _load_from_db()

    if not date_to:
        date_to = date.today().strftime("%Y-%m-%d")
    if not date_from:
        date_from = (date.today() - timedelta(days=30)).strftime("%Y-%m-%d")

    start = datetime.strptime(date_from, "%Y-%m-%d").date()
    end = datetime.strptime(date_to, "%Y-%m-%d").date()
    total_days = (end - start).days + 1

    synced = 0
    consecutive_failures = 0

    d = end
    while d >= start:
        date_str = d.strftime("%Y-%m-%d")
        d -= timedelta(days=1)

        if date_str in _rate_cache:
            # Check if we already have the needed currencies
            if not only_currencies or only_currencies.issubset(_rate_cache[date_str].keys()):
                continue

        bnm_date = datetime.strptime(date_str, "%Y-%m-%d").strftime("%d.%m.%Y")
        url = f"https://bnm.md/en/official_exchange_rates?get_xml=1&date={bnm_date}"
        try:
            resp = httpx.get(url, timeout=15)
            resp.raise_for_status()
            consecutive_failures = 0
        except (httpx.HTTPError, httpx.TimeoutException) as e:
            consecutive_failures += 1
            logger.warning("sync_rates: BNM API failed for %s: %s (%d consecutive)",
                           date_str, e, consecutive_failures)
            if consecutive_failures >= 3:
                logger.warning("sync_rates: stopping after %d consecutive failures", consecutive_failures)
                break
            continue

        rates = _parse_bnm_xml(resp.content, only_currencies)

        if rates:
            # Merge with existing cache (don't overwrite other currencies)
            if date_str in _rate_cache:
                _rate_cache[date_str].update(rates)
            else:
                _rate_cache[date_str] = rates
            _save_to_db(date_str, rates)
            synced += 1

        if on_progress:
            done = (end - d).days
            on_progress(done, total_days, synced)

    if synced > 0:
        _update_last_sync()

    return synced


def sync_recent_rates(days: int = 30) -> int:
    """Convenience wrapper: sync last N days for EUR/USD only."""
    date_to = date.today().strftime("%Y-%m-%d")
    date_from = (date.today() - timedelta(days=days)).strftime("%Y-%m-%d")
    return sync_rates(date_from=date_from, date_to=date_to, only_currencies={"EUR", "USD"})


def convert_amount(amount: float, currency: str, target: str, date_str: str) -> float:
    """Convert amount from `currency` to `target` using BNM rate for `date_str`.
    Supported targets: "MDL", "EUR", "USD" or any BNM currency.
    """
    if currency == target:
        return amount

    rates = fetch_bnm_rates(date_str)

    # First convert to MDL
    if currency == "MDL":
        amount_mdl = amount
    else:
        rate = rates.get(currency, 0)
        if rate == 0:
            return amount  # fallback: no conversion
        amount_mdl = amount * rate

    # Then from MDL to target
    if target == "MDL":
        return amount_mdl

    target_rate = rates.get(target, 0)
    if target_rate == 0:
        return amount_mdl  # fallback
    return amount_mdl / target_rate
