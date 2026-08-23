from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy import (
    Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.modules.credits.enums import LedgerReason


class CreditPackage(Base):
    __tablename__ = "credit_packages"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    price_egp: Mapped[int] = mapped_column(Integer, nullable=False)
    base_credits: Mapped[int] = mapped_column(Integer, nullable=False)
    bonus_pct: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    total_credits: Mapped[int] = mapped_column(
        Integer,
        Computed("base_credits + (base_credits * bonus_pct / 100)", persisted=True),
    )
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    store_product_id_ios: Mapped[str | None] = mapped_column(Text)
    store_product_id_android: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("100"))


class CreditLedger(Base):
    __tablename__ = "credit_ledger"
    __table_args__ = (Index("ix_credit_ledger_user_created", "user_id", text("created_at desc")),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[LedgerReason] = mapped_column(
        SQLEnum(
            LedgerReason,
            name="ledger_reason",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    ai_action_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    package_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("credit_packages.id", ondelete="SET NULL"), nullable=True
    )
    payment_ref: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CreditReservation(Base):
    __tablename__ = "credit_reservations"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_credit_reservations_amount_positive"),
        Index("ix_credit_reservations_status_expires", "status", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'held'"))
    ai_action_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now() + interval '10 minutes'"),
    )
