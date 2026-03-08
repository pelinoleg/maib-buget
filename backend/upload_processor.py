"""Shared PDF processing logic used by both the web API and the Telegram bot."""
import re
from collections import defaultdict
from sqlalchemy.orm import Session

from models import Account, Transaction, Upload, TypeRule
from parsers import parse_pdf
from dedup import compute_hash, is_transfer, determine_type, _normalize_desc
from categorizer import apply_rules, categorize_with_ai


class PDFProcessingError(Exception):
    """Raised when PDF parsing or processing fails."""
    pass


def _unwrap_mime_if_needed(file_path: str) -> str:
    """If the file is wrapped in a MIME envelope, extract the PDF payload."""
    with open(file_path, "rb") as f:
        header = f.read(16)
    if header.startswith(b"%PDF-"):
        return file_path  # already a plain PDF

    with open(file_path, "rb") as f:
        data = f.read()
    idx = data.find(b"%PDF-")
    if idx == -1:
        return file_path  # not a PDF at all — let parser raise the error

    # Find MIME boundary after PDF content
    boundary = b"\r\n--uuid:"
    end_idx = data.find(boundary, idx)
    pdf_data = data[idx:end_idx] if end_idx != -1 else data[idx:]

    # Write extracted PDF back to the same path
    with open(file_path, "wb") as f:
        f.write(pdf_data)
    return file_path


async def process_pdf(db: Session, file_path: str, filename: str) -> dict:
    """Process a MAIB bank statement PDF and return stats.

    Args:
        db: SQLAlchemy session
        file_path: Path to the PDF file on disk
        filename: Original filename for recording

    Returns:
        dict with keys: filename, account, currency, new_transactions,
        duplicates_skipped, total_in_file, rules_applied, ai_categorized

    Raises:
        PDFProcessingError: if PDF cannot be parsed
    """
    # Unwrap MIME envelope if present (some banks wrap PDF in MIME)
    file_path = _unwrap_mime_if_needed(file_path)

    try:
        statement = parse_pdf(file_path)
    except Exception as e:
        raise PDFProcessingError(
            f"Nu s-a putut procesa fișierul '{filename}': {e}"
        ) from e

    if not statement.transactions:
        raise PDFProcessingError(
            f"Nu s-au găsit tranzacții în fișierul '{filename}'. "
            "Verifică că este un extras de cont valid."
        )

    # Get or create account
    account = db.query(Account).filter(
        Account.account_number == statement.account_number
    ).first()
    if not account:
        account = Account(
            account_number=statement.account_number,
            iban=statement.iban,
            currency=statement.currency,
            name=f"Cont {statement.currency} ({statement.account_number[-4:]})",
            bank=statement.bank,
        )
        db.add(account)
        db.flush()
    elif not account.bank and statement.bank:
        account.bank = statement.bank

    # Load type rules for classification
    type_rules = db.query(TypeRule).filter(
        TypeRule.is_active == True
    ).order_by(TypeRule.priority.desc(), TypeRule.id).all()

    new_count = 0
    dup_count = 0
    hash_seq = {}
    new_txns = []

    for txn in statement.transactions:
        base_key = (
            f"{statement.account_number}|{txn.transaction_date}|{txn.processing_date}"
            f"|{txn.description}|{txn.original_amount}|{txn.original_currency}|{txn.amount}"
        )
        seq = hash_seq.get(base_key, 0)
        hash_seq[base_key] = seq + 1

        txn_hash = compute_hash(statement.account_number, txn, seq)

        # Primary check: exact hash match
        existing = db.query(Transaction).filter(Transaction.hash == txn_hash).first()
        if existing:
            dup_count += 1
            continue

        # Fallback check: same account + date + amount + normalized description
        # from a DIFFERENT source file. Catches duplicates from overlapping PDFs
        # where the same transaction is parsed with different description lengths.
        norm_desc = _normalize_desc(txn.description)
        fallback = db.query(Transaction).filter(
            Transaction.account_id == account.id,
            Transaction.transaction_date == txn.transaction_date,
            Transaction.amount == txn.amount,
            Transaction.source_file != filename,
        ).all()
        if any(_normalize_desc(f.description) == norm_desc for f in fallback):
            dup_count += 1
            continue

        txn_type = determine_type(txn, type_rules)
        transfer = is_transfer(txn, type_rules)

        db_txn = Transaction(
            account_id=account.id,
            transaction_date=txn.transaction_date,
            processing_date=txn.processing_date,
            description=txn.description,
            original_amount=txn.original_amount,
            original_currency=txn.original_currency,
            amount=txn.amount,
            type=txn_type,
            balance_after=txn.balance_after,
            commission=txn.commission,
            is_transfer=transfer,
            hash=txn_hash,
            source_file=filename,
        )
        db.add(db_txn)
        new_txns.append(db_txn)
        new_count += 1

    db.flush()
    new_ids = {t.id for t in new_txns}
    _link_transfers(db)
    _mark_cancellations(db, new_ids)

    upload = Upload(
        filename=filename,
        account_number=statement.account_number,
        transactions_count=new_count,
        duplicates_skipped=dup_count,
    )
    db.add(upload)
    db.commit()

    # Auto-categorize (non-critical — failures should not break the upload response)
    rules_applied = 0
    ai_categorized = 0
    try:
        rules_applied = apply_rules(db)
        ai_result = await categorize_with_ai(db)
        ai_categorized = ai_result.get("categorized", 0)
        while ai_categorized > 0:
            ai_result = await categorize_with_ai(db)
            batch = ai_result.get("categorized", 0)
            if batch == 0:
                break
            ai_categorized += batch
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Auto-categorization failed (upload still saved)")

    return {
        "upload_id": upload.id,
        "filename": filename,
        "account": statement.account_number,
        "currency": statement.currency,
        "bank": statement.bank or "unknown",
        "period_start": statement.period_start,
        "period_end": statement.period_end,
        "new_transactions": new_count,
        "duplicates_skipped": dup_count,
        "total_in_file": len(statement.transactions),
        "rules_applied": rules_applied,
        "ai_categorized": ai_categorized,
    }


def _link_transfers(db: Session):
    """Link transfer pairs via linked_transaction_id."""
    forex_txns = db.query(Transaction).filter(
        Transaction.is_transfer == True,
        Transaction.linked_transaction_id == None,
        Transaction.description.ilike("%tranzactie forex%"),
    ).all()

    for txn in forex_txns:
        m = re.search(r'FOREX\s+\w+[\d.]+/([A-Z]+)(\d+\.\d+)', txn.description)
        if not m:
            continue
        target_amount = float(m.group(2))

        candidates = db.query(Transaction).filter(
            Transaction.is_transfer == True,
            Transaction.linked_transaction_id == None,
            Transaction.id != txn.id,
            Transaction.transaction_date == txn.transaction_date,
            Transaction.description.like("%A2A%"),
        ).all()

        for candidate in candidates:
            if abs(candidate.amount - target_amount) < 0.01:
                txn.linked_transaction_id = candidate.id
                candidate.linked_transaction_id = txn.id
                break


def _mark_cancellations(db: Session, new_ids: set[int] | None = None):
    """Mark paired debit+credit reversals as cancelled.

    Only considers pairs where at least one transaction is new (in new_ids).
    """
    txns = db.query(Transaction).filter(
        Transaction.is_transfer == False,
    ).all()

    def desc_key(desc: str) -> str:
        """Extract first 2 significant words as a matching key."""
        words = desc.lower().split()
        significant = [w for w in words if len(w) >= 3][:2]
        return " ".join(significant)

    pairs = defaultdict(list)
    for t in txns:
        key = (t.transaction_date, round(abs(t.amount), 2))
        pairs[key].append(t)

    for key, group in pairs.items():
        pos = [t for t in group if t.amount > 0]
        neg = [t for t in group if t.amount < 0]

        if not pos or not neg:
            continue

        used_pos = set()
        for n in neg:
            n_base = desc_key(n.description) if n.description else ""
            if not n_base:
                continue
            for i, p in enumerate(pos):
                if i in used_pos:
                    continue
                # Only mark if at least one transaction is new
                if new_ids and n.id not in new_ids and p.id not in new_ids:
                    continue
                p_base = desc_key(p.description) if p.description else ""
                if p_base == n_base and abs(p.amount + n.amount) < 0.01:
                    n.type = "cancelled"
                    p.type = "cancelled"
                    used_pos.add(i)
                    break
