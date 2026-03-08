import os
import re
import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from models import Upload
from upload_processor import process_pdf, PDFProcessingError

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", Path(__file__).resolve().parent.parent / "uploaded_pdfs"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def build_stored_path(result: dict, upload_id: int) -> str:
    """Build a structured stored path: bank/bank_CUR_acc4_period.pdf

    Example: maib/maib_EUR_1234_2026-01.pdf
    """
    bank = result.get("bank", "unknown").lower()
    currency = result.get("currency", "XXX").upper()
    account = result.get("account", "0000")
    acc_short = account[-4:] if len(account) >= 4 else account

    # Parse period — use YYYY-MM format
    period_start = result.get("period_start", "")
    period_end = result.get("period_end", "")

    def to_ym(date_str: str) -> str:
        """Convert DD.MM.YYYY or YYYY-MM-DD to YYYY-MM."""
        m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", date_str)
        if m:
            return f"{m.group(3)}-{m.group(2)}"
        m = re.match(r"(\d{4})-(\d{2})", date_str)
        if m:
            return f"{m.group(1)}-{m.group(2)}"
        return ""

    ym_start = to_ym(period_start)
    ym_end = to_ym(period_end)

    if ym_start and ym_end and ym_start != ym_end:
        period = f"{ym_start}_{ym_end}"
    elif ym_start:
        period = ym_start
    else:
        period = f"upload_{upload_id}"

    filename = f"{bank}_{currency}_{acc_short}_{period}.pdf"
    return f"{bank}/{filename}"


def save_pdf(tmp_path: str, result: dict, db: Session):
    """Save PDF to structured storage and update Upload record."""
    upload_id = result.get("upload_id")
    if not upload_id:
        os.unlink(tmp_path)
        return

    stored_path = build_stored_path(result, upload_id)

    dest = UPLOAD_DIR / stored_path
    dest.parent.mkdir(parents=True, exist_ok=True)

    # If file with same name exists, append upload_id
    if dest.exists():
        stem = dest.stem
        stored_path = f"{dest.parent.name}/{stem}_{upload_id}.pdf"
        dest = UPLOAD_DIR / stored_path

    shutil.move(tmp_path, str(dest))

    upload_rec = db.query(Upload).get(upload_id)
    if upload_rec:
        upload_rec.stored_path = stored_path
        db.commit()


@router.post("")
async def upload_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload and process a MAIB bank statement PDF."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await process_pdf(db, tmp_path, file.filename)
        save_pdf(tmp_path, result, db)
        return result
    except PDFProcessingError as e:
        return JSONResponse(status_code=422, content={"error": str(e)})
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.get("")
def list_uploads(db: Session = Depends(get_db)):
    uploads = db.query(Upload).order_by(Upload.uploaded_at.desc()).all()
    return [
        {
            "id": u.id,
            "filename": u.filename,
            "stored_path": u.stored_path,
            "uploaded_at": u.uploaded_at.isoformat() if u.uploaded_at else None,
            "account_number": u.account_number,
            "transactions_count": u.transactions_count,
            "duplicates_skipped": u.duplicates_skipped,
            "has_file": bool(u.stored_path and (UPLOAD_DIR / u.stored_path).exists()),
        }
        for u in uploads
    ]


@router.get("/{upload_id}/download")
def download_pdf(upload_id: int, db: Session = Depends(get_db)):
    upload = db.query(Upload).get(upload_id)
    if not upload or not upload.stored_path:
        raise HTTPException(status_code=404, detail="Fișierul nu a fost găsit")
    file_path = UPLOAD_DIR / upload.stored_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fișierul nu mai există pe disc")
    # Build a human-friendly download name from stored_path
    # e.g. "bbva/bbva_EUR_1069_2025-01.pdf" → "BBVA EUR 1069 — Ianuarie 2025.pdf"
    month_names = ["", "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
                   "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"]
    download_name = upload.filename
    if upload.stored_path and "/" in upload.stored_path:
        stem = upload.stored_path.split("/")[-1]
        m = re.match(r"(\w+)_([A-Z]{3})_(\d+)_(.+)\.pdf$", stem, re.IGNORECASE)
        if m:
            bank, currency, acc, period = m.group(1), m.group(2).upper(), m.group(3), m.group(4)
            # Convert period "2025-01" → "Ianuarie 2025", "2025-01_2025-03" → "Ianuarie–Martie 2025"
            parts = period.split("_")
            def fmt_ym(ym: str) -> str:
                pm = re.match(r"(\d{4})-(\d{2})", ym)
                if pm:
                    return f"{month_names[int(pm.group(2))]} {pm.group(1)}"
                return ym
            if len(parts) == 2:
                period_str = f"{fmt_ym(parts[0])}–{fmt_ym(parts[1])}"
            else:
                period_str = fmt_ym(parts[0])
            download_name = f"{bank.upper()} {currency} {acc} — {period_str}.pdf"

    return FileResponse(
        path=str(file_path),
        filename=download_name,
        media_type="application/pdf",
    )
