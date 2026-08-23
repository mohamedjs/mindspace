from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
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
from app.modules.billing.enums import PaymentChannel, SubscriptionStatus


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    tagline: Mapped[str | None] = mapped_column(Text)
    price_egp: Mapped[int] = mapped_column(Integer, nullable=False)
    base_credits: Mapped[int] = mapped_column(Integer, nullable=False)
    bonus_pct: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    total_credits: Mapped[int] = mapped_column(
        Integer,
        Computed("base_credits + (base_credits * bonus_pct / 100)", persisted=True),
    )
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("100"))
    max_recording_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("5")
    )
    is_byok: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    ai_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (Index("ix_subscriptions_user_status", "user_id", "status"),)

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
    plan_id: Mapped[str] = mapped_column(Text, ForeignKey("subscription_plans.id"), nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(
        SQLEnum(
            SubscriptionStatus,
            name="subscription_status",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=text("'pending'"),
    )
    channel: Mapped[PaymentChannel] = mapped_column(
        SQLEnum(
            PaymentChannel,
            name="payment_channel",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    external_ref: Mapped[str | None] = mapped_column(Text)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("channel", "external_ref", name="uq_payments_channel_external_ref"),
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
    package_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("credit_packages.id", ondelete="SET NULL"), nullable=True
    )
    subscription_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("subscriptions.id", ondelete="SET NULL"),
        nullable=True,
    )
    amount_egp: Mapped[int] = mapped_column(Integer, nullable=False)
    channel: Mapped[str] = mapped_column(Text, nullable=False)
    external_ref: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending'"))
    raw_receipt: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
