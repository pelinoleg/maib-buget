from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship, validates
from datetime import datetime, timezone

VALID_TRANSACTION_TYPES = {"income", "expense", "transfer", "cancelled", "refund"}

from database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_number = Column(String, unique=True, index=True)
    iban = Column(String, nullable=True)
    currency = Column(String, nullable=False)
    name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    bank = Column(String, nullable=True)  # "maib", "n26", etc.
    account_type = Column(String, default="checking")  # checking, card, cash, savings, investment, other
    is_monitored = Column(Integer, default=1)  # 1=monitored, 0=not monitored for upload coverage

    transactions = relationship("Transaction", back_populates="account")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    color = Column(String, nullable=True)
    icon = Column(String, nullable=True)

    parent = relationship("Category", remote_side=[id], backref="subcategories")
    transactions = relationship("Transaction", back_populates="category")
    rules = relationship("CategoryRule", back_populates="category")


class CategoryRule(Base):
    __tablename__ = "category_rules"

    id = Column(Integer, primary_key=True, index=True)
    pattern = Column(String, nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    match_type = Column(String, default="contains")  # "contains" or "regex"
    priority = Column(Integer, default=1)  # 1-10, higher wins when multiple rules match
    is_approved = Column(Boolean, default=True)
    source_example = Column(String, nullable=True)  # example transaction description

    category = relationship("Category", back_populates="rules")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    transaction_date = Column(String, nullable=False, index=True)
    processing_date = Column(String, nullable=True)
    description = Column(Text, nullable=False)
    original_amount = Column(Float, nullable=True)
    original_currency = Column(String, nullable=True)
    amount = Column(Float, nullable=False, index=True)  # in account currency
    type = Column(String, nullable=False, index=True)  # income, expense, transfer
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, index=True)
    categorized_by = Column(String, nullable=True)  # "rule", "manual", "ai", null=uncategorized
    applied_rule_id = Column(Integer, ForeignKey("category_rules.id"), nullable=True)
    balance_after = Column(Float, nullable=True)
    commission = Column(Float, default=0)
    is_transfer = Column(Boolean, default=False)
    linked_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    hash = Column(String, unique=True, index=True)
    source_file = Column(String, nullable=True)
    note = Column(Text, nullable=True)

    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    applied_rule = relationship("CategoryRule", foreign_keys=[applied_rule_id])
    linked_transaction = relationship("Transaction", remote_side=[id])

    @validates("type")
    def validate_type(self, key, value):
        if value not in VALID_TRANSACTION_TYPES:
            raise ValueError(f"Invalid transaction type: '{value}'. Must be one of: {VALID_TRANSACTION_TYPES}")
        return value


class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    account_number = Column(String, nullable=True)
    stored_path = Column(String, nullable=True)
    transactions_count = Column(Integer, default=0)
    duplicates_skipped = Column(Integer, default=0)


class TypeRule(Base):
    __tablename__ = "type_rules"

    id = Column(Integer, primary_key=True, index=True)
    pattern = Column(String, nullable=False)
    match_type = Column(String, default="contains")  # "contains" or "regex"
    target_type = Column(String, nullable=False)      # "transfer", "income", "expense"
    description = Column(String, nullable=True)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    priority = Column(Integer, default=0)


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = (UniqueConstraint("date", "currency", name="uq_rate_date_currency"),)

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    currency = Column(String, nullable=False)           # EUR, USD, etc.
    rate = Column(Float, nullable=False)                # MDL per 1 unit


class SavedFilter(Base):
    __tablename__ = "saved_filters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    period_preset = Column(String, nullable=True)
    date_from = Column(String, nullable=True)
    date_to = Column(String, nullable=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    type = Column(String, nullable=True)
    search = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
