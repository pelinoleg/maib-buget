"""AI-powered budget analysis endpoint."""
import json
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select
from typing import Optional

from database import get_db
from models import Transaction, Account, Category

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
AI_PROMPT_FILE = Path(__file__).resolve().parent.parent / "ai_prompt.json"

router = APIRouter(prefix="/api/ai", tags=["ai"])

DEFAULT_SYSTEM_MESSAGE = "Ești un consultant financiar profesionist care analizează bugetul personal. Primești lista completă de tranzacții și trebuie să calculezi singur toate totalurile, procentele, mediile. Răspunzi mereu în română, concret, cu cifre."

DEFAULT_USER_PROMPT_TEMPLATE = """Analizează următoarele tranzacții financiare și oferă un raport detaliat.

PERIOADA: {period}
TOTAL TRANZACȚII: {len_txns}

FORMAT: dată | sumă valută | tip (income/expense/refund/transfer) | categorie | bancă | descriere

TRANZACȚII:
{transactions_list}

Calculează singur toate totalurile, procentele, mediile. Analizează pattern-urile, cheltuielile recurente, categoriile.

Răspunde OBLIGATORIU în ROMÂNĂ cu următoarea structură exactă (folosește markdown):

## Evaluare generală
(1-2 propoziții scurte despre starea financiară generală în această perioadă, include totaluri calculate de tine)

## Ce este bine
(puncte concrete cu cifre calculate din tranzacții — nu sfaturi generice)

## Ce îngrijorează
(puncte concrete cu cifre — cheltuieli excesive, pattern-uri problematice)

## Recomandări de optimizare
(acțiuni specifice, cu estimarea economisirii potențiale în cifre)

## Analiza cheltuielilor pe categorii
(folosește un tabel markdown cu coloanele: Categorie | Total | % din total. Calculează totalul per categorie și procentul din cheltuieli totale)

## Cheltuieli recurente — oportunități
(detectează plățile care se repetă lunar, ce poate fi anulat/optimizat, cât s-ar economisi pe lună/an)

## Verdict final
(2-3 propoziții rezumat — nota generală de la 1 la 10 pentru disciplina financiară)

IMPORTANT: Fii direct, concret, cu cifre calculate de tine. Nu da sfaturi generice. Referă-te la tranzacțiile concrete din date."""


def _load_prompt() -> tuple[str, str]:
    """Load custom prompt from file, or return defaults."""
    if AI_PROMPT_FILE.exists():
        try:
            data = json.loads(AI_PROMPT_FILE.read_text(encoding="utf-8"))
            return (
                data.get("system_message", DEFAULT_SYSTEM_MESSAGE),
                data.get("user_prompt_template", DEFAULT_USER_PROMPT_TEMPLATE),
            )
        except (json.JSONDecodeError, KeyError):
            pass
    return DEFAULT_SYSTEM_MESSAGE, DEFAULT_USER_PROMPT_TEMPLATE


class AnalyzeRequest(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    account_id: Optional[int] = None
    bank: Optional[str] = None
    category_id: Optional[int] = None
    type: Optional[str] = None


@router.post("/analyze")
async def analyze_budget(req: AnalyzeRequest, db: Session = Depends(get_db)):
    """Analyze budget with AI based on filtered transactions."""
    if not OPENAI_API_KEY:
        raise HTTPException(503, "OPENAI_API_KEY not set.")

    from openai import AsyncOpenAI

    # Build query with filters
    q = db.query(Transaction).options(
        joinedload(Transaction.account),
        joinedload(Transaction.category),
    )

    if req.date_from:
        q = q.filter(Transaction.transaction_date >= req.date_from)
    if req.date_to:
        q = q.filter(Transaction.transaction_date <= req.date_to)
    if req.account_id:
        q = q.filter(Transaction.account_id == req.account_id)
    if req.bank:
        q = q.filter(Transaction.account_id.in_(
            select(Account.id).where(Account.bank == req.bank)
        ))
    if req.category_id:
        q = q.filter(Transaction.category_id == req.category_id)
    if req.type:
        q = q.filter(Transaction.type == req.type)

    txns = q.order_by(Transaction.transaction_date).all()

    if not txns:
        raise HTTPException(404, "Nu sunt tranzacții pentru filtrele selectate.")

    # Build transaction list
    txn_lines = []
    for t in txns:
        cat = t.category.name if t.category else "—"
        cur = t.account.currency if t.account else ""
        bank = t.account.bank if t.account else ""
        sign = "+" if t.amount > 0 else ""
        note = f" [{t.note}]" if t.note else ""
        txn_lines.append(
            f"{t.transaction_date} | {sign}{t.amount:.2f} {cur} | {t.type} | {cat} | {bank} | {t.description[:80]}{note}"
        )
    transactions_list = "\n".join(txn_lines)
    period = f"{req.date_from or 'început'} — {req.date_to or 'prezent'}"

    system_message, user_prompt_template = _load_prompt()

    prompt = user_prompt_template.format(
        period=period,
        len_txns=len(txns),
        transactions_list=transactions_list,
    )

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=4000,
        temperature=0.7,
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt},
        ],
    )

    analysis = response.choices[0].message.content.strip()

    return {
        "analysis": analysis,
        "transaction_count": len(txns),
    }
