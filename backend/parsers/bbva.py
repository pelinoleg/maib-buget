"""BBVA bank statement PDF parser."""
import re
import pdfplumber

from .base import ParsedTransaction, ParsedStatement


# Spanish month names → month number
MONTH_MAP = {
    "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4,
    "MAYO": 5, "JUNIO": 6, "JULIO": 7, "AGOSTO": 8,
    "SEPTIEMBRE": 9, "OCTUBRE": 10, "NOVIEMBRE": 11, "DICIEMBRE": 12,
}

# Transaction line: DD/MM DD/MM DESCRIPTION AMOUNT BALANCE
# or: DD/MM DD/MM DESCRIPTION AMOUNT
TXN_RE = re.compile(
    r'^(\d{2}/\d{2})\s+(\d{2}/\d{2})\s+(.+?)\s+(-?[\d.,]+)\s+([\d.,]+)$'
)
TXN_NO_BAL_RE = re.compile(
    r'^(\d{2}/\d{2})\s+(\d{2}/\d{2})\s+(.+?)\s+(-?[\d.,]+)$'
)


def _parse_eu_amount(text: str) -> float:
    """Parse European amount: 1.214,33 or -72,52."""
    if not text or not text.strip():
        return 0.0
    text = text.strip().replace("\xa0", "").replace(" ", "")
    text = text.replace(".", "")   # remove thousands separator
    text = text.replace(",", ".")  # decimal comma → dot
    try:
        return float(text)
    except ValueError:
        return 0.0


def _extract_period(full_text: str) -> tuple[str, str, int, int]:
    """Extract period from header like EXTRACTO DE OCTUBRE 2025."""
    for month_name, month_num in MONTH_MAP.items():
        m = re.search(rf"EXTRACTO\s*DE\s*{month_name}\s*(\d{{4}})", full_text, re.IGNORECASE)
        if m:
            year = int(m.group(1))
            import calendar
            last_day = calendar.monthrange(year, month_num)[1]
            start = f"{year}-{month_num:02d}-01"
            end = f"{year}-{month_num:02d}-{last_day:02d}"
            return start, end, month_num, year

    # Fallback: Fecha de emisión
    m = re.search(r"Fecha\s*de\s*emisi[oó]n:\s*(\d{2})/(\d{2})/(\d{4})", full_text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if month == 1:
            month = 12
            year -= 1
        else:
            month -= 1
        import calendar
        last_day = calendar.monthrange(year, month)[1]
        start = f"{year}-{month:02d}-01"
        end = f"{year}-{month:02d}-{last_day:02d}"
        return start, end, month, year

    return "", "", 0, 0


def _normalize_case(s: str) -> str:
    """Convert ALL-CAPS BBVA descriptions to Title Case, preserving codes/numbers."""
    words = s.split()
    result = []
    for w in words:
        # Preserve: starts with digit, codes like C.CIRCUNVAL, S.A, 6A
        if re.match(r'^\d', w) or re.match(r'^[A-Z]\.\w', w):
            result.append(w)
        # Mixed case already (e.g. "Simyo", "Endesa") — keep as-is
        elif not w.isupper():
            result.append(w)
        # ALL CAPS word → capitalize
        elif w.isupper() and len(w) > 1:
            result.append(w.capitalize())
        else:
            result.append(w)
    return " ".join(result)


def _make_date(dd_mm: str, stmt_month: int, stmt_year: int) -> str:
    """Convert DD/MM to YYYY-MM-DD using statement year."""
    m = re.match(r"(\d{2})/(\d{2})", dd_mm)
    if not m:
        return ""
    day = int(m.group(1))
    month = int(m.group(2))
    year = stmt_year
    if stmt_month == 12 and month == 1:
        year += 1
    elif stmt_month == 1 and month == 12:
        year -= 1
    return f"{year}-{month:02d}-{day:02d}"


def parse_bbva(file_path: str) -> ParsedStatement:
    """Parse a BBVA bank statement PDF and return structured data."""
    with pdfplumber.open(file_path) as pdf:
        all_lines = []
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            all_lines.extend(text.split("\n"))

    full_text = "\n".join(all_lines)

    # IBAN
    iban = ""
    m = re.search(r"IBAN\s+(ES[\d\s]+?)(?:\s+BIC|\s*$)", full_text, re.MULTILINE)
    if m:
        iban = m.group(1).replace(" ", "")
    account_number = iban[-10:] if len(iban) >= 10 else iban

    # Client name
    client_name = ""
    m = re.search(r"Titulares:\s*(.+)", full_text)
    if m:
        client_name = m.group(1).strip().title()

    # Period
    period_start, period_end, stmt_month, stmt_year = _extract_period(full_text)

    # Opening balance from SALDO ANTERIOR line
    opening_balance = 0.0
    m = re.search(r"SALDO\s*ANTERIOR.*?([\d.,]+)\s*$", full_text, re.MULTILINE)
    if m:
        opening_balance = _parse_eu_amount(m.group(1))

    # Closing balance from footer
    closing_balance = 0.0
    m = re.search(r"EURO\s+([\d.,]+)", full_text)
    if m:
        closing_balance = _parse_eu_amount(m.group(1))

    # Parse transactions
    transactions = []
    i = 0
    while i < len(all_lines):
        line = all_lines[i].strip()

        # Skip non-transaction lines
        m_bal = TXN_RE.match(line)
        m_nobal = TXN_NO_BAL_RE.match(line) if not m_bal else None

        if m_bal or m_nobal:
            m = m_bal or m_nobal
            f_oper = m.group(1)
            f_valor = m.group(2)
            description = m.group(3).strip()
            amount = _parse_eu_amount(m.group(4))
            balance_after = _parse_eu_amount(m.group(5)) if m_bal else None

            # Collect continuation lines (detail lines below the transaction)
            details = []
            i += 1
            while i < len(all_lines):
                next_line = all_lines[i].strip()
                if not next_line:
                    i += 1
                    continue
                # Next transaction?
                if TXN_RE.match(next_line) or TXN_NO_BAL_RE.match(next_line):
                    break
                # Footer/header?
                if next_line.startswith("SALDO") or next_line.startswith("F.Oper") or "EXTRACTO" in next_line:
                    break
                if next_line.startswith("Todos los") or next_line.startswith("EURO"):
                    break
                if re.match(r'^[A-Z]\d{5}$', next_line) or re.match(r'^Q\d+', next_line):
                    i += 1
                    continue
                details.append(next_line)
                i += 1

            if details:
                description = description + " " + " ".join(details)
                description = re.sub(r"\s+", " ", description).strip()

            description = _normalize_case(description)

            oper_date = _make_date(f_oper, stmt_month, stmt_year)
            valor_date = _make_date(f_valor, stmt_month, stmt_year)

            transactions.append(ParsedTransaction(
                transaction_date=oper_date,
                processing_date=valor_date,
                description=description,
                original_amount=abs(amount),
                original_currency="EUR",
                amount=amount,
                balance_after=balance_after,
            ))
        else:
            i += 1

    # Fallback closing balance
    if closing_balance == 0.0 and transactions:
        for t in reversed(transactions):
            if t.balance_after is not None:
                closing_balance = t.balance_after
                break

    return ParsedStatement(
        account_number=account_number,
        iban=iban,
        currency="EUR",
        client_name=client_name,
        period_start=period_start,
        period_end=period_end,
        opening_balance=opening_balance,
        closing_balance=closing_balance,
        total_outflows=sum(abs(t.amount) for t in transactions if t.amount < 0),
        total_inflows=sum(t.amount for t in transactions if t.amount > 0),
        total_commission=0.0,
        bank="bbva",
        transactions=transactions,
    )
