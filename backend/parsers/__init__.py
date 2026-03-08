"""Multi-bank PDF parser dispatcher."""
import pdfplumber

from .base import ParsedTransaction, ParsedStatement, parse_amount


def detect_bank(first_page_text: str) -> str:
    """Auto-detect bank from PDF text content."""
    if "Extracto bancario" in first_page_text and "NTSBESM1" in first_page_text:
        return "n26"
    if "Extras de cont" in first_page_text or "Sold ini" in first_page_text:
        return "maib"
    # Check N26 without BIC (in case BIC is only in footer)
    if "Extracto bancario" in first_page_text and "N26" in first_page_text:
        return "n26"
    if "EXTRACTO MENSUAL" in first_page_text or "EXTRACTOMENSUAL" in first_page_text:
        return "bbva"
    raise ValueError(
        "Formatul PDF nu a fost recunoscut. "
        "Sunt acceptate extrase de la: MAIB, N26, BBVA."
    )


def parse_pdf(file_path: str) -> ParsedStatement:
    """Parse a bank statement PDF, auto-detecting the bank format."""
    with pdfplumber.open(file_path) as pdf:
        first_page = pdf.pages[0].extract_text() or ""
        # Also try with x_tolerance=1 for PDFs with tight spacing (BBVA)
        first_page_xt = pdf.pages[0].extract_text(x_tolerance=1) or ""
        # Also check last lines of first page (N26 has IBAN in footer)
        all_first = first_page + "\n" + first_page_xt
        if len(pdf.pages) > 1:
            all_first += "\n" + (pdf.pages[-1].extract_text() or "")

    bank = detect_bank(all_first)

    if bank == "maib":
        from .maib import parse_maib
        return parse_maib(file_path)
    elif bank == "n26":
        from .n26 import parse_n26
        return parse_n26(file_path)
    elif bank == "bbva":
        from .bbva import parse_bbva
        return parse_bbva(file_path)

    raise ValueError(f"Unknown bank: {bank}")
