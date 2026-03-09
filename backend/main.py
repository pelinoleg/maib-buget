from pathlib import Path
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import *  # noqa: ensure models are registered
from routers import uploads, transactions, categories, accounts, dashboard, saved_filters, type_rules, tax, ai_analysis, settings
from categorizer import apply_rules, categorize_with_ai

Base.metadata.create_all(bind=engine)

# Migrate: add is_approved column to category_rules if missing
from sqlalchemy import inspect as sa_inspect, text
insp = sa_inspect(engine)
if "category_rules" in insp.get_table_names():
    cols = [c["name"] for c in insp.get_columns("category_rules")]
    if "is_approved" not in cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE category_rules ADD COLUMN is_approved BOOLEAN DEFAULT 1"))
            conn.commit()
    if "source_example" not in cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE category_rules ADD COLUMN source_example TEXT"))
            conn.commit()
    if "match_type" not in cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE category_rules ADD COLUMN match_type TEXT DEFAULT 'contains'"))
            conn.commit()
    if "priority" not in cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE category_rules ADD COLUMN priority INTEGER DEFAULT 1"))
            conn.commit()

# Migrate: add description column to accounts if missing
if "accounts" in insp.get_table_names():
    acc_cols = [c["name"] for c in insp.get_columns("accounts")]
    if "description" not in acc_cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN description TEXT"))
            conn.commit()

# Seed default type rules if table is empty
from database import SessionLocal
from models import TypeRule
_seed_db = SessionLocal()
if _seed_db.query(TypeRule).count() == 0:
    _default_rules = [
        TypeRule(pattern="a2a de intrare", match_type="contains", target_type="transfer",
                 description="Transfer A2A — intrare pe cont", is_system=True, priority=10),
        TypeRule(pattern="a2a de iesire", match_type="contains", target_type="transfer",
                 description="Transfer A2A — ieșire de pe cont", is_system=True, priority=10),
        TypeRule(pattern="achitare datorie restanta la cont", match_type="contains", target_type="transfer",
                 description="Achitare datorie la cont propriu", is_system=True, priority=10),
        TypeRule(pattern=r"tranzactie forex.*EUR", match_type="regex", target_type="transfer",
                 description="FOREX spre EUR — transfer între conturi proprii", is_system=True, priority=5),
        TypeRule(pattern=r"tranzactie forex.*MDL", match_type="regex", target_type="expense",
                 description="FOREX spre MDL — conversie valutară pentru plăți", is_system=True, priority=5),
    ]
    _seed_db.add_all(_default_rules)
    _seed_db.commit()
_seed_db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Telegram bot
    from bot import start_bot
    start_bot()

    # Startup: background BNM sync
    import asyncio
    import logging
    logger = logging.getLogger("bnm.sync")

    async def _periodic_sync():
        while True:
            try:
                from bnm import sync_recent_rates
                from concurrent.futures import ThreadPoolExecutor
                loop = asyncio.get_event_loop()
                with ThreadPoolExecutor(max_workers=1) as pool:
                    synced = await loop.run_in_executor(pool, lambda: sync_recent_rates(days=30))
                if synced > 0:
                    logger.info("Background BNM sync: %d new dates", synced)
            except Exception as e:
                logger.warning("Background BNM sync failed: %s", e)
            await asyncio.sleep(6 * 3600)

    task = asyncio.create_task(_periodic_sync())
    yield
    task.cancel()


app = FastAPI(title="Buget - Analiză Financiară", lifespan=lifespan, docs_url="/api/docs", redoc_url="/api/redoc", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(uploads.router)
app.include_router(transactions.router)
app.include_router(categories.router)
app.include_router(accounts.router)
app.include_router(dashboard.router)
app.include_router(saved_filters.router)
app.include_router(type_rules.router)
app.include_router(tax.router)
app.include_router(ai_analysis.router)
app.include_router(settings.router)


@app.post("/api/categorize/apply-rules")
def api_apply_rules(db: Session = Depends(get_db)):
    count = apply_rules(db)
    return {"applied": count}


@app.post("/api/categorize/reapply-all")
def api_reapply_all_rules(db: Session = Depends(get_db)):
    """Re-apply category rules to ALL transactions (overwriting existing categories)."""
    all_txns = db.query(Transaction).all()
    count = apply_rules(db, transactions=all_txns)
    return {"applied": count, "total": len(all_txns)}


@app.post("/api/categorize/refresh-ai")
async def api_refresh_ai(db: Session = Depends(get_db)):
    """Delete all pending (unapproved) rules and re-run AI categorization."""
    from models import CategoryRule
    deleted = db.query(CategoryRule).filter(CategoryRule.is_approved == False).delete()
    db.commit()
    result = await categorize_with_ai(db)
    return {"deleted_pending": deleted, **result}


@app.post("/api/reset-database")
def reset_database(db: Session = Depends(get_db)):
    """DEV ONLY: Wipe all data except categories."""
    from models import Transaction, Upload, Account, CategoryRule, SavedFilter
    db.query(Transaction).delete()
    db.query(Upload).delete()
    db.query(Account).delete()
    db.query(CategoryRule).delete()
    db.query(SavedFilter).delete()
    db.commit()
    return {"status": "ok", "message": "All data cleared (categories kept)"}


@app.delete("/api/bank/{bank_name}/purge")
def purge_bank_data(bank_name: str, db: Session = Depends(get_db)):
    """Delete all transactions, uploads, and accounts for a specific bank."""
    accs = db.query(Account).filter(Account.bank == bank_name).all()
    if not accs:
        return {"status": "not_found", "message": f"No accounts found for bank '{bank_name}'"}
    acc_ids = [a.id for a in accs]
    acc_numbers = [a.account_number for a in accs]
    t = db.query(Transaction).filter(Transaction.account_id.in_(acc_ids)).delete(synchronize_session=False)
    u = db.query(Upload).filter(Upload.account_number.in_(acc_numbers)).delete(synchronize_session=False)
    a = db.query(Account).filter(Account.id.in_(acc_ids)).delete(synchronize_session=False)
    db.commit()
    return {"status": "ok", "deleted_transactions": t, "deleted_uploads": u, "deleted_accounts": a}


@app.get("/api/health")
def health():
    return {"status": "ok"}


