import hashlib
import re
from pdf_parser import ParsedTransaction


def _normalize_desc(desc: str) -> str:
    """Normalize description for dedup: first 80 chars, collapsed whitespace, lowered."""
    return re.sub(r'\s+', ' ', desc).strip().lower()[:80]


def compute_hash(account_number: str, txn: ParsedTransaction, seq: int = 0) -> str:
    """Compute a unique hash for deduplication. seq differentiates same-day same-description transactions.

    Description is normalized (first 80 chars, collapsed whitespace) to ensure
    the same transaction parsed from different PDF files produces the same hash.
    """
    norm_desc = _normalize_desc(txn.description)
    key = f"{account_number}|{txn.transaction_date}|{txn.processing_date}|{norm_desc}|{txn.original_amount}|{txn.original_currency}|{txn.amount}|{seq}"
    return hashlib.sha256(key.encode()).hexdigest()


def determine_type(txn: ParsedTransaction, type_rules=None) -> str:
    """Determine transaction type using configurable TypeRule objects.

    type_rules: list of TypeRule model instances (ordered by priority desc).
    Each rule has: pattern, match_type ("contains"/"regex"), target_type, is_active.
    """
    if type_rules:
        desc = txn.description
        for rule in type_rules:
            if not rule.is_active:
                continue
            if rule.match_type == "regex":
                if re.search(rule.pattern, desc, re.IGNORECASE):
                    return rule.target_type
            else:
                if rule.pattern.lower() in desc.lower():
                    return rule.target_type

    # Fallback: amount-based
    # Positive amounts without an explicit income rule → refund (not real income)
    if txn.amount > 0:
        return "refund"
    return "expense"


def is_transfer(txn: ParsedTransaction, type_rules=None) -> bool:
    """Check if transaction is a transfer based on type rules."""
    return determine_type(txn, type_rules) == "transfer"


def extract_transfer_info(txn: ParsedTransaction) -> dict:
    """Extract transfer details for linking paired transactions."""
    desc = txn.description
    info = {}

    # A2A: extract source account
    m = re.search(r'de pe cont\s*(\d+)', desc)
    if m:
        info['other_account'] = m.group(1)
        info['direction'] = 'incoming'
        return info

    m = re.search(r'pe cont\s*(\d+)', desc)
    if m:
        info['other_account'] = m.group(1)
        info['direction'] = 'outgoing'
        return info

    # FOREX: extract EUR amount and target account from description
    forex_m = re.search(r'FOREX\s+USD([\d.]+)/EUR([\d.]+)', desc)
    if forex_m:
        info['usd_amount'] = float(forex_m.group(1))
        info['eur_amount'] = float(forex_m.group(2))
        info['direction'] = 'outgoing'

    forex_mdl = re.search(r'FOREX\s+USD([\d.]+)/MDL([\d.]+)', desc)
    if forex_mdl:
        info['usd_amount'] = float(forex_mdl.group(1))
        info['mdl_amount'] = float(forex_mdl.group(2))
        info['direction'] = 'outgoing'

    if txn.correspondent_account:
        info['other_account'] = txn.correspondent_account

    # A2A on card (short form)
    if 'a2a de intrare pe cardul' in desc.lower():
        info['direction'] = 'incoming'

    return info
