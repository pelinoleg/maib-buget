import os
from datetime import date
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Transaction, Account
from bnm import fetch_bnm_rates

router = APIRouter(prefix="/api/tax", tags=["tax"])


@router.get("/config")
def get_tax_config():
    """Return tax calculation parameters from env."""
    return {
        "tax_rate": float(os.getenv("TAX_RATE", "12")),
        "child_deduction": float(os.getenv("TAX_CHILD_DEDUCTION", "9000")),
        "personal_deduction": float(os.getenv("TAX_PERSONAL_DEDUCTION", "27000")),
    }


@router.get("/income")
def get_tax_income(year: int = Query(...), db: Session = Depends(get_db)):
    """Get all income transactions for a given year."""
    txns = db.query(Transaction).options(
        joinedload(Transaction.account),
    ).join(Account).filter(
        Transaction.type == "income",
        Transaction.is_transfer == False,
        Transaction.transaction_date.like(f"{year}-%"),
        Account.bank == "maib",
    ).order_by(Transaction.transaction_date).all()

    incomes = []
    for t in txns:
        incomes.append({
            "id": t.id,
            "date": t.transaction_date,
            "description": t.description,
            "amount": t.amount,
            "currency": t.account.currency if t.account else "?",
            "account_name": t.account.name if t.account else "?",
        })

    return {"year": year, "incomes": incomes}


class ConvertRequest(BaseModel):
    year: int


def convert_incomes_to_mdl(db: Session, year: int) -> dict:
    """Core conversion logic — reusable by API endpoint and Telegram bot."""
    txns = db.query(Transaction).options(
        joinedload(Transaction.account),
    ).join(Account).filter(
        Transaction.type == "income",
        Transaction.is_transfer == False,
        Transaction.transaction_date.like(f"{year}-%"),
        Account.bank == "maib",
    ).order_by(Transaction.transaction_date).all()

    today_str = date.today().strftime("%Y-%m-%d")
    today_rates = fetch_bnm_rates(today_str)
    eur_rate_today = today_rates.get("EUR", 0)

    incomes = []
    total_mdl = 0.0
    errors = []

    for t in txns:
        currency = t.account.currency if t.account else None
        if not currency or currency == "MDL":
            amount_mdl = abs(t.amount)
            rate = 1.0
        else:
            try:
                rates = fetch_bnm_rates(t.transaction_date)
                rate = rates.get(currency, 0)
                if rate == 0:
                    errors.append(f"No rate for {currency} on {t.transaction_date}")
                    rate = 0
                amount_mdl = abs(t.amount) * rate
            except Exception as e:
                errors.append(f"Error fetching rate for {t.transaction_date}: {str(e)}")
                rate = 0
                amount_mdl = 0

        total_mdl += amount_mdl
        incomes.append({
            "id": t.id,
            "date": t.transaction_date,
            "description": t.description,
            "amount": t.amount,
            "currency": currency or "?",
            "account_name": t.account.name if t.account else "?",
            "rate": round(rate, 4),
            "amount_mdl": round(amount_mdl, 2),
        })

    total_eur_equivalent = round(total_mdl / eur_rate_today, 2) if eur_rate_today > 0 else 0

    return {
        "year": year,
        "incomes": incomes,
        "total_mdl": round(total_mdl, 2),
        "eur_rate_today": round(eur_rate_today, 4),
        "total_eur_equivalent": total_eur_equivalent,
        "errors": errors if errors else None,
    }


@router.post("/convert")
def convert_to_mdl(data: ConvertRequest, db: Session = Depends(get_db)):
    """Convert all income for a year to MDL using BNM rates per transaction date."""
    return convert_incomes_to_mdl(db, data.year)
