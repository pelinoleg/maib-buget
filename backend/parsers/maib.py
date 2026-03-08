"""MAIB bank statement PDF parser."""
import re
import pdfplumber
from typing import Optional

from .base import ParsedTransaction, ParsedStatement, parse_amount


def extract_header_info(text: str) -> dict:
    info = {}
    m = re.search(r'Num[aă]r\s*cont:\s*(\d+)', text)
    if m:
        info['account_number'] = m.group(1)
    m = re.search(r'Cod\s*IBAN:\s*(MD\w+)', text)
    if m:
        info['iban'] = m.group(1)
    m = re.search(r'Valuta\s*contului:\s*(\w+)', text)
    if m:
        info['currency'] = m.group(1)
    m = re.search(r'Client:\s*(.+?)(?:\n|$)', text)
    if m:
        info['client_name'] = m.group(1).strip()
    m = re.search(r'(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})', text)
    if m:
        info['period_start'] = m.group(1)
        info['period_end'] = m.group(2)
    for label, key in [
        ('Sold ini', 'opening_balance'),
        ('Total ie', 'total_outflows'),
        ('Total intr', 'total_inflows'),
        ('Total comision', 'total_commission'),
        ('Sold final', 'closing_balance'),
    ]:
        m = re.search(rf'{label}[^:]*:\s*([\d\s]+\.?\d*)', text)
        if m:
            info[key] = parse_amount(m.group(1))
    return info


def detect_format(first_page_text: str) -> str:
    """Detect EUR (has comision column) vs USD (has Cont corespondent)."""
    if "Cont corespondent" in first_page_text:
        return "usd"
    return "eur"


# Regex for a line starting with two dates (normal transaction)
DATE_LINE_RE = re.compile(r'^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.+)$')
# Regex for processing transactions (single date)
SINGLE_DATE_RE = re.compile(r'^(\d{4}-\d{2}-\d{2})\s+(.+)$')
# Page number at bottom
PAGE_NUM_RE = re.compile(r'^\d+\s*din\s*\d+$')


def parse_eur_transactions(all_lines: list[str]) -> list[ParsedTransaction]:
    transactions = []
    current_section = "account"
    in_processing = False
    i = 0

    while i < len(all_lines):
        line = all_lines[i].strip()

        if not line or PAGE_NUM_RE.match(line):
            i += 1
            continue

        if line.startswith("#Cardul"):
            current_section = "card"
            in_processing = False
            i += 1
            continue
        if line.startswith("#Cont"):
            current_section = "account"
            in_processing = False
            i += 1
            continue

        if "procesare" in line.lower() and ("#cardul" in line.lower() or "tranzac" in line.lower()):
            in_processing = True
            i += 1
            continue

        if line.startswith("Data") or line.startswith("Suma") or line.startswith("ie") or line.startswith("tranzac"):
            i += 1
            continue

        m = DATE_LINE_RE.match(line)
        m_single = SINGLE_DATE_RE.match(line) if not m and in_processing else None

        if m or m_single:
            if m:
                date_tranz = m.group(1)
                date_proc = m.group(2)
                rest = m.group(3)
            else:
                date_tranz = m_single.group(1)
                date_proc = date_tranz
                rest = m_single.group(2)

            section = "processing" if in_processing else current_section

            desc_extra = []
            i += 1
            while i < len(all_lines):
                next_line = all_lines[i].strip()
                if not next_line or PAGE_NUM_RE.match(next_line):
                    i += 1
                    continue
                if DATE_LINE_RE.match(next_line) or (in_processing and SINGLE_DATE_RE.match(next_line)):
                    break
                if next_line.startswith("#") or next_line.startswith("Data") or next_line.startswith("Suma"):
                    break
                if "procesare" in next_line.lower() and ("#cardul" in next_line.lower() or "tranzac" in next_line.lower()):
                    in_processing = True
                    i += 1
                    continue
                if next_line.startswith("Sf") or "extras" in next_line.lower():
                    i += 1
                    continue
                desc_extra.append(next_line)
                i += 1

            txn = _parse_eur_rest(date_tranz, date_proc, rest, desc_extra, section)
            if txn:
                transactions.append(txn)
        else:
            i += 1

    return transactions


def _parse_eur_rest(date_tranz: str, date_proc: str, rest: str, extra_lines: list[str], section: str) -> Optional[ParsedTransaction]:
    m = re.search(r'(-?\d[\d\s]*\.?\d*)\s+(EUR|USD|MDL|RON|RUB|GBP|CHF|PLN|CZK|SEK|NOK|DKK|HUF|TRY|BGN|HRK)\s+([\d\s.]+)$', rest)
    if not m:
        return None

    description_part = rest[:m.start()].strip()
    orig_amount_str = m.group(1)
    orig_currency = m.group(2)
    numbers_str = m.group(3).strip()

    full_desc = description_part
    if extra_lines:
        full_desc += " " + " ".join(extra_lines)
    full_desc = re.sub(r'\s+', ' ', full_desc).strip()

    original_amount = parse_amount(orig_amount_str)

    numbers = re.findall(r'[\d]+\.[\d]+|[\d]+', numbers_str)
    numbers = [float(n) for n in numbers]

    iesiri = 0.0
    intrari = 0.0
    commission = 0.0
    balance_after = None
    is_processing = (section == "processing")

    if original_amount < 0:
        if is_processing:
            iesiri = parse_amount(numbers_str)
            amount = -iesiri
        elif len(numbers) >= 3:
            iesiri = numbers[0]
            commission = numbers[1]
            balance_after = numbers[2]
            amount = -iesiri
        elif len(numbers) >= 2:
            iesiri = numbers[0]
            balance_after = numbers[1]
            amount = -iesiri
        elif len(numbers) >= 1:
            iesiri = numbers[0]
            amount = -iesiri
        else:
            amount = original_amount
    else:
        if is_processing:
            intrari = parse_amount(numbers_str)
            amount = intrari
        elif len(numbers) >= 2:
            intrari = numbers[0]
            balance_after = numbers[1]
            amount = intrari
        elif len(numbers) >= 1:
            intrari = numbers[0]
            amount = intrari
        else:
            amount = original_amount

    return ParsedTransaction(
        transaction_date=date_tranz,
        processing_date=date_proc,
        description=full_desc,
        original_amount=original_amount,
        original_currency=orig_currency,
        amount=amount,
        commission=commission,
        balance_after=balance_after,
        section=section,
    )


def parse_usd_transactions(all_lines: list[str]) -> list[ParsedTransaction]:
    transactions = []
    i = 0

    while i < len(all_lines):
        line = all_lines[i].strip()

        if not line or PAGE_NUM_RE.match(line):
            i += 1
            continue

        if line.startswith("#Cont") or line.startswith("Data") or line.startswith("Suma") or line.startswith("ie") or line.startswith("tranzac"):
            i += 1
            continue

        m = DATE_LINE_RE.match(line)
        if m:
            date_tranz = m.group(1)
            date_proc = m.group(2)
            rest = m.group(3)

            desc_extra = []
            i += 1
            while i < len(all_lines):
                next_line = all_lines[i].strip()
                if not next_line or PAGE_NUM_RE.match(next_line):
                    i += 1
                    continue
                if DATE_LINE_RE.match(next_line):
                    break
                if next_line.startswith("#") or next_line.startswith("Data") or next_line.startswith("Suma"):
                    break
                desc_extra.append(next_line)
                i += 1

            txn = _parse_usd_rest(date_tranz, date_proc, rest, desc_extra)
            if txn:
                transactions.append(txn)
        else:
            i += 1

    return transactions


def _parse_usd_rest(date_tranz: str, date_proc: str, rest: str, extra_lines: list[str]) -> Optional[ParsedTransaction]:
    m = re.search(r'(-?\d[\d\s]*\.?\d*)\s+USD\s+(\d+)\s+([\d\s.]+)$', rest)
    if not m:
        return None

    description_part = rest[:m.start()].strip()
    orig_amount_str = m.group(1)
    correspondent = m.group(2)
    trailing_amount_str = m.group(3).strip()

    full_desc = description_part
    if extra_lines:
        full_desc += " " + " ".join(extra_lines)
    full_desc = re.sub(r'\s+', ' ', full_desc).strip()

    original_amount = parse_amount(orig_amount_str)
    trailing_amount = parse_amount(trailing_amount_str)

    if original_amount < 0:
        amount = -trailing_amount if trailing_amount else original_amount
    else:
        amount = trailing_amount if trailing_amount else original_amount

    return ParsedTransaction(
        transaction_date=date_tranz,
        processing_date=date_proc,
        description=full_desc,
        original_amount=original_amount,
        original_currency="USD",
        amount=amount,
        correspondent_account=correspondent,
        section="account",
    )


def parse_maib(file_path: str) -> ParsedStatement:
    """Parse a MAIB bank statement PDF and return structured data."""
    with pdfplumber.open(file_path) as pdf:
        all_text = ""
        all_lines = []
        for page in pdf.pages:
            text = page.extract_text() or ""
            all_text += text + "\n"
            all_lines.extend(text.split("\n"))

        header_info = extract_header_info(all_text)
        fmt = detect_format(all_text)

        statement = ParsedStatement(
            account_number=header_info.get('account_number', ''),
            iban=header_info.get('iban', ''),
            currency=header_info.get('currency', ''),
            client_name=header_info.get('client_name', ''),
            period_start=header_info.get('period_start', ''),
            period_end=header_info.get('period_end', ''),
            opening_balance=header_info.get('opening_balance', 0),
            closing_balance=header_info.get('closing_balance', 0),
            total_outflows=header_info.get('total_outflows', 0),
            total_inflows=header_info.get('total_inflows', 0),
            total_commission=header_info.get('total_commission', 0),
            bank="maib",
        )

        if fmt == "eur":
            statement.transactions = parse_eur_transactions(all_lines)
        else:
            statement.transactions = parse_usd_transactions(all_lines)

    return statement
