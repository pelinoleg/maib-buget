"""N26 bank statement PDF parser."""
import re
import pdfplumber
from typing import Optional

from .base import ParsedTransaction, ParsedStatement


def _parse_eu_amount(text: str) -> float:
    """Parse European amount format: -6,96€ or +104,95€ or 0,00€."""
    text = text.strip().replace("€", "").replace("\xa0", "").replace(" ", "")
    text = text.replace(".", "")  # remove thousands separator (dots)
    text = text.replace(",", ".")  # decimal comma → dot
    try:
        return float(text)
    except ValueError:
        return 0.0


# Transaction line: "MERCHANT_NAME  DD.MM.YYYY  -X,XX€" or "+X,XX€"
TXN_LINE_RE = re.compile(
    r'^(.+?)\s+(\d{2}\.\d{2}\.\d{4})\s+([+-]?\d[\d.,]*€)$'
)


def _convert_date(date_str: str) -> str:
    """Convert DD.MM.YYYY to YYYY-MM-DD."""
    parts = date_str.split(".")
    if len(parts) == 3:
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    return date_str


def parse_n26(file_path: str) -> ParsedStatement:
    """Parse an N26 bank statement PDF and return structured data."""
    with pdfplumber.open(file_path) as pdf:
        all_pages_text = []
        for page in pdf.pages:
            text = page.extract_text() or ""
            all_pages_text.append(text)

    full_text = "\n".join(all_pages_text)

    # Extract IBAN from footer
    iban = ""
    m = re.search(r'IBAN:\s*(ES\w+)', full_text)
    if m:
        iban = m.group(1)

    # Account number = last 10 digits of IBAN
    account_number = iban[-10:] if len(iban) >= 10 else iban

    # Client name
    client_name = ""
    m = re.search(r'^([A-Z][A-Z\s]+)$', full_text, re.MULTILINE)
    if m:
        client_name = m.group(1).strip()

    # Period
    period_start = ""
    period_end = ""
    m = re.search(r'(\d{2}\.\d{2}\.\d{4})\s+hasta\s+(\d{2}\.\d{2}\.\d{4})', full_text)
    if m:
        period_start = _convert_date(m.group(1))
        period_end = _convert_date(m.group(2))

    # Summary from Resumen page
    opening_balance = 0.0
    closing_balance = 0.0
    total_outflows = 0.0
    total_inflows = 0.0

    m = re.search(r'Saldo previo\s+([+-]?\d[\d.,]*€)', full_text)
    if m:
        opening_balance = _parse_eu_amount(m.group(1))
    m = re.search(r'Tu nuevo saldo\s+([+-]?\d[\d.,]*€)', full_text)
    if m:
        closing_balance = _parse_eu_amount(m.group(1))
    m = re.search(r'Transacciones salientes\s+([+-]?\d[\d.,]*€)', full_text)
    if m:
        total_outflows = abs(_parse_eu_amount(m.group(1)))
    m = re.search(r'Transacciones entrantes\s+([+-]?\d[\d.,]*€)', full_text)
    if m:
        total_inflows = _parse_eu_amount(m.group(1))

    # Parse transactions from "Extracto bancario" pages (skip Resumen, Espacios)
    transactions = []
    for page_text in all_pages_text:
        # Skip summary and sub-account pages
        if page_text.strip().startswith("Resumen"):
            continue
        if "Extracto del espacio" in page_text:
            continue
        if "Resumen de espacios" in page_text:
            continue
        if not page_text.strip().startswith("Extracto bancario"):
            # Could be notes page
            if "Nota" in page_text and "Nuestros términos" in page_text:
                continue

        lines = page_text.split("\n")
        transactions.extend(_parse_n26_page_transactions(lines))

    statement = ParsedStatement(
        account_number=account_number,
        iban=iban,
        currency="EUR",
        client_name=client_name,
        period_start=period_start,
        period_end=period_end,
        opening_balance=opening_balance,
        closing_balance=closing_balance,
        total_outflows=total_outflows,
        total_inflows=total_inflows,
        total_commission=0.0,
        bank="n26",
        transactions=transactions,
    )
    return statement


def _parse_n26_page_transactions(lines: list[str]) -> list[ParsedTransaction]:
    """Parse transactions from a single N26 page."""
    transactions = []
    i = 0

    while i < len(lines):
        line = lines[i].strip()

        # Skip header/footer lines
        if not line or line.startswith("Extracto bancario") or line.startswith("Descripción"):
            i += 1
            continue
        # Skip footer (OLEG PELIN, address, IBAN line, date range)
        if "IBAN:" in line and "BIC:" in line:
            i += 1
            continue
        if "hasta" in line and re.match(r'\d{2}\.\d{2}\.\d{4}', line):
            i += 1
            continue
        # Skip page numbers like "1 / 6"
        if re.match(r'^\d+\s*/\s*\d+$', line):
            i += 1
            continue
        # Skip footer name/address lines
        if re.match(r'^(Emitido en|Nº \d|Carrer |Badalona)', line):
            i += 1
            continue

        # Try to match transaction line
        m = TXN_LINE_RE.match(line)
        if m:
            merchant = m.group(1).strip()
            date_str = m.group(2)
            amount_str = m.group(3)

            date_iso = _convert_date(date_str)
            amount = _parse_eu_amount(amount_str)

            # Collect detail lines until next transaction or end
            details = []
            fecha_valor = None
            original_amount = None
            original_currency = None

            i += 1
            while i < len(lines):
                detail = lines[i].strip()
                if not detail:
                    i += 1
                    continue
                # Next transaction?
                if TXN_LINE_RE.match(detail):
                    break
                # Footer?
                if "IBAN:" in detail and "BIC:" in detail:
                    break
                if re.match(r'^(Emitido en|Nº \d|Carrer |Badalona)', detail):
                    break
                if re.match(r'^\d+\s*/\s*\d+$', detail):
                    i += 1
                    continue

                # Extract fecha de valor
                fv = re.match(r'Fecha de valor\s+(\d{2}\.\d{2}\.\d{4})', detail)
                if fv:
                    fecha_valor = _convert_date(fv.group(1))
                    i += 1
                    continue

                # Extract original amount (foreign currency)
                orig = re.match(r'Importe original\s+([\d.,]+)\s+(\w+)\s*\|', detail)
                if orig:
                    orig_str = orig.group(1).replace(".", "").replace(",", ".")
                    try:
                        original_amount = float(orig_str)
                    except ValueError:
                        pass
                    original_currency = orig.group(2)
                    i += 1
                    continue

                details.append(detail)
                i += 1

            # Build description from merchant + details
            desc_parts = [merchant]
            for d in details:
                # Skip generic labels
                if d in ("Mastercard", "Domiciliación bancaria"):
                    continue
                if d.startswith("Mastercard •"):
                    continue
                desc_parts.append(d)
            description = " ".join(desc_parts)
            description = re.sub(r'\s+', ' ', description).strip()

            processing_date = fecha_valor or date_iso

            # If no foreign currency, original = account currency amount
            if original_amount is None:
                original_amount = abs(amount)
                original_currency = "EUR"

            transactions.append(ParsedTransaction(
                transaction_date=date_iso,
                processing_date=processing_date,
                description=description,
                original_amount=original_amount if amount < 0 else original_amount,
                original_currency=original_currency or "EUR",
                amount=amount,
            ))
        else:
            i += 1

    return transactions
