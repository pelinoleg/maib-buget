import os
import re
import json
from sqlalchemy.orm import Session
from sqlalchemy import func

from models import Transaction, Category, CategoryRule

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def apply_rules(db: Session, transactions: list[Transaction] = None):
    """Apply existing category rules to uncategorized transactions."""
    rules = db.query(CategoryRule).filter(CategoryRule.is_approved == True).all()
    if not rules:
        return 0

    if transactions is None:
        transactions = db.query(Transaction).filter(Transaction.category_id == None).all()

    count = 0
    for txn in transactions:
        desc = txn.description
        for rule in rules:
            if rule.match_type == "regex":
                if re.search(rule.pattern, desc, re.IGNORECASE):
                    txn.category_id = rule.category_id
                    count += 1
                    break
            else:
                if rule.pattern.lower() in desc.lower():
                    txn.category_id = rule.category_id
                    count += 1
                    break

    db.commit()
    return count


async def categorize_with_ai(db: Session, transaction_ids: list[int] = None):
    """Use OpenAI API to categorize uncategorized transactions."""
    if not OPENAI_API_KEY:
        return {"error": "OPENAI_API_KEY not set. Export it: export OPENAI_API_KEY=sk-...", "categorized": 0}

    from openai import AsyncOpenAI

    # Get ALL categories (parents + subcategories)
    all_cats = db.query(Category).all()
    if not all_cats:
        return {"error": "No categories exist. Create categories first.", "categorized": 0}

    # Build category list with hierarchy
    parents = [c for c in all_cats if not c.parent_id]
    cat_lines = []
    for p in parents:
        children = [c for c in all_cats if c.parent_id == p.id]
        if children:
            child_str = ", ".join(f"{c.id}: {c.name}" for c in children)
            cat_lines.append(f"- {p.id}: {p.name} (subcategorii: {child_str})")
        else:
            cat_lines.append(f"- {p.id}: {p.name}")
    cat_list = "\n".join(cat_lines)

    valid_cat_ids = {c.id for c in all_cats}

    # Get existing rules — separate approved vs all for dedup
    all_rules = db.query(CategoryRule).all()
    existing_patterns = {r.pattern.lower() for r in all_rules}
    approved_patterns = {r.pattern.lower(): r for r in all_rules if r.is_approved}

    # Get uncategorized transactions (non-transfer)
    q = db.query(Transaction).filter(
        Transaction.category_id == None,
        Transaction.is_transfer == False,
        Transaction.type != "cancelled",
    )
    if transaction_ids:
        q = q.filter(Transaction.id.in_(transaction_ids))

    transactions = q.limit(50).all()
    if not transactions:
        return {"categorized": 0, "message": "No uncategorized transactions"}

    txn_list = "\n".join(
        f"- ID {t.id}: \"{t.description}\" ({t.type}, {abs(t.amount)} {t.account.currency if t.account else ''})"
        for t in transactions
    )

    prompt = f"""Ai o listă de categorii financiare și o listă de tranzacții bancare.
Atribuie fiecare tranzacție la categoria sau subcategoria cea mai potrivită.
Preferă subcategorii când sunt disponibile.

Categorii disponibile:
{cat_list}

Tranzacții de categorisit:
{txn_list}

Răspunde DOAR cu un JSON array: [{{"id": <transaction_id>, "category_id": <category_id>, "rule_pattern": "<cuvânt cheie scurt din descriere pentru reguli viitoare>"}}]
Reguli pentru rule_pattern:
- Folosește un cuvânt cheie UNIC care identifică comerciantul (ex: "LIDL", "NETFLIX", "MCDONALD")
- NU folosi cuvinte generice care pot apărea în multe tranzacții diferite
- Pattern-ul trebuie să fie suficient de specific pentru a categorisa automat tranzacții viitoare similare
Nu adăuga alte explicații."""

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.choices[0].message.content.strip()
    # Extract JSON from response
    start = text.find("[")
    end = text.rfind("]") + 1
    if start == -1 or end == 0:
        return {"error": "Could not parse AI response", "categorized": 0}

    try:
        assignments = json.loads(text[start:end])
    except (json.JSONDecodeError, ValueError):
        return {"error": "Invalid JSON from AI", "categorized": 0}
    categorized = 0
    pending_count = 0

    for item in assignments:
        txn_id = item.get("id")
        cat_id = item.get("category_id")
        pattern = item.get("rule_pattern", "")

        if cat_id not in valid_cat_ids:
            continue

        txn = db.query(Transaction).get(txn_id)
        if not txn or txn.category_id is not None:
            continue

        pattern_lower = pattern.lower() if pattern else ""

        # Check if an approved rule already covers this pattern
        has_approved = False
        if pattern_lower:
            for ap_lower, ap_rule in approved_patterns.items():
                if ap_lower in txn.description.lower():
                    has_approved = True
                    break

        if has_approved:
            # Approved rule exists — apply category immediately
            txn.category_id = cat_id
            categorized += 1
        else:
            # New pattern — create pending rule, DON'T categorize yet
            if pattern and len(pattern) >= 3 and pattern_lower not in existing_patterns:
                db.add(CategoryRule(
                    pattern=pattern.upper(),
                    category_id=cat_id,
                    is_approved=False,
                    source_example=txn.description[:200],
                ))
                existing_patterns.add(pattern_lower)
                pending_count += 1
            else:
                # No usable pattern or duplicate — skip, wait for rule approval
                pass

    db.commit()
    return {"categorized": categorized, "pending": pending_count, "total": len(transactions)}
