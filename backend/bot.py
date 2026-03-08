"""Telegram bot for Buget — PDF upload and tax calculation."""
import os
import logging
import tempfile
import asyncio
from datetime import date

from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

from database import SessionLocal
from upload_processor import process_pdf
from routers.uploads import save_pdf
from routers.tax import convert_incomes_to_mdl

logger = logging.getLogger(__name__)


def _fmt(n: float) -> str:
    """Format number with 2 decimal places and thousands separator."""
    return f"{n:,.2f}".replace(",", " ")


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "👋 Salut! Eu sunt botul Buget.\n\n"
        "📄 Trimite-mi un PDF cu extras de cont MAIB și îl voi procesa automat.\n\n"
        "📊 /tax — calculează impozitul pe venit pentru anul trecut\n"
        "📊 /tax 2024 — calculează pentru un an specific\n"
    )


async def cmd_tax(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Parse year from args
    if context.args:
        try:
            year = int(context.args[0])
        except ValueError:
            await update.message.reply_text("❌ Folosire: /tax sau /tax 2025")
            return
    else:
        year = date.today().year - 1

    await update.message.reply_text(f"⏳ Se calculează veniturile pentru {year}...")

    db = SessionLocal()
    try:
        result = convert_incomes_to_mdl(db, year)
    finally:
        db.close()

    incomes = result["incomes"]
    if not incomes:
        await update.message.reply_text(f"📭 Nu sunt venituri înregistrate în {year}.")
        return

    total_mdl = result["total_mdl"]
    eur_rate_today = result["eur_rate_today"]
    total_eur = result["total_eur_equivalent"]

    # Group by currency
    by_currency: dict[str, float] = {}
    for inc in incomes:
        by_currency[inc["currency"]] = by_currency.get(inc["currency"], 0) + inc["amount"]

    income_lines = " + ".join(f"{_fmt(v)} {k}" for k, v in by_currency.items())

    # Tax calculation from env
    tax_rate = float(os.getenv("TAX_RATE", "12"))
    child_ded = float(os.getenv("TAX_CHILD_DEDUCTION", "9000"))
    personal_ded = float(os.getenv("TAX_PERSONAL_DEDUCTION", "27000"))

    # Child deduction always on; personal only if total < 360,000
    apply_child = True
    apply_personal = total_mdl < 360_000

    deductions = 0.0
    ded_lines = []

    if apply_child:
        deductions += child_ded
        ded_lines.append(f"  − Scutire copil:   {_fmt(child_ded)} MDL ✅")
    else:
        ded_lines.append(f"  − Scutire copil:   {_fmt(child_ded)} MDL ❌")

    if apply_personal:
        deductions += personal_ded
        ded_lines.append(f"  − Scutire pers.:   {_fmt(personal_ded)} MDL ✅ (< 360 000)")
    else:
        ded_lines.append(f"  − Scutire pers.:   {_fmt(personal_ded)} MDL ❌ (> 360 000)")

    taxable = max(0, total_mdl - deductions)
    tax_amount = taxable * (tax_rate / 100)

    tax_eur = tax_amount / eur_rate_today if eur_rate_today > 0 else 0

    msg = (
        f"📊 Declarație fiscală {year}\n\n"
        f"💰 Venituri: {income_lines}\n"
        f"💵 Total MDL: {_fmt(total_mdl)} MDL (curs BNM per zi)\n"
        f"💶 ≈ {_fmt(total_eur)} EUR (curs azi: {eur_rate_today})\n"
        f"📋 {len(incomes)} tranzacții\n\n"
        f"📋 Calcul impozit:\n"
        f"  Venit total:      {_fmt(total_mdl)} MDL\n"
        + "\n".join(ded_lines) + "\n"
        f"  Venit impozabil:  {_fmt(taxable)} MDL\n"
        f"  Cota:             {tax_rate}%\n\n"
        f"🧾 De plătit: {_fmt(tax_amount)} MDL (≈ {_fmt(tax_eur)} EUR)"
    )

    if result.get("errors"):
        msg += "\n\n⚠️ Erori:\n" + "\n".join(result["errors"])

    await update.message.reply_text(msg)


async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc:
        return

    if doc.mime_type != "application/pdf":
        await update.message.reply_text("❌ Trimite un fișier PDF (extras de cont MAIB).")
        return

    await update.message.reply_text(f"⏳ Se procesează {doc.file_name}...")

    # Download file
    tg_file = await doc.get_file()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        await tg_file.download_to_drive(tmp.name)
        tmp_path = tmp.name

    db = SessionLocal()
    try:
        result = await process_pdf(db, tmp_path, doc.file_name)
        save_pdf(tmp_path, result, db)
    except Exception as e:
        logger.exception("Error processing PDF from Telegram")
        await update.message.reply_text(f"❌ Eroare la procesare: {e}")
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return
    finally:
        db.close()
        # Clean up only if save_pdf didn't move it
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    msg = (
        f"✅ {result['filename']}\n\n"
        f"📂 Cont: {result['account']} ({result['currency']})\n"
        f"📥 Tranzacții noi: {result['new_transactions']}\n"
        f"🔄 Duplicate omise: {result['duplicates_skipped']}\n"
        f"📄 Total în fișier: {result['total_in_file']}\n"
    )
    if result.get("rules_applied", 0) > 0:
        msg += f"📋 Reguli aplicate: {result['rules_applied']}\n"
    if result.get("ai_categorized", 0) > 0:
        msg += f"🤖 AI categorisit: {result['ai_categorized']}\n"

    await update.message.reply_text(msg)


def start_bot():
    """Start the Telegram bot. Call from main.py startup."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        logger.info("TELEGRAM_BOT_TOKEN not set, bot disabled")
        return

    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("tax", cmd_tax))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_document))

    logger.info("Starting Telegram bot...")

    # Run bot polling in a background thread
    import threading

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(app.initialize())
            loop.run_until_complete(app.start())
            loop.run_until_complete(app.updater.start_polling(drop_pending_updates=True))
            loop.run_forever()
        except Exception as e:
            logger.error("Telegram bot failed to start: %s", e)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
