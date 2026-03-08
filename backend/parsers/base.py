"""Shared data classes and utilities for bank statement parsers."""
import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ParsedTransaction:
    transaction_date: str
    processing_date: str
    description: str
    original_amount: float
    original_currency: str
    amount: float  # in account currency (negative for expense, positive for income)
    commission: float = 0.0
    balance_after: Optional[float] = None
    correspondent_account: Optional[str] = None
    section: str = ""  # "account" or "card" or "processing"


@dataclass
class ParsedStatement:
    account_number: str
    iban: str
    currency: str
    client_name: str
    period_start: str
    period_end: str
    opening_balance: float
    closing_balance: float
    total_outflows: float
    total_inflows: float
    total_commission: float
    bank: str = ""  # "maib", "n26", etc.
    transactions: list[ParsedTransaction] = field(default_factory=list)


def parse_amount(text: str) -> float:
    """Parse a number string with various separators (comma, space, nbsp)."""
    if not text or not text.strip():
        return 0.0
    text = text.strip().replace("\n", "").replace(" ", "").replace("\xa0", "")
    text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0.0
