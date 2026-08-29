from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
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
from app.modules.ai.enums import AiActionKind, AiActionStatus, ModelKind, ProviderId


class AiModel(Base):
    __tablename__ = "ai_models"
    __table_args__ = (
        UniqueConstraint("provider", "model_id", "kind", name="uq_ai_models_provider_model_kind"),
    )

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    provider: Mapped[ProviderId] = mapped_column(
        SQLEnum(
            ProviderId,
            name="provider_id",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    model_id: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[ModelKind] = mapped_column(
        SQLEnum(
            ModelKind,
            name="model_kind",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    input_price_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    output_price_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    price_per_min: Mapped[Decimal | None] = mapped_column(Numeric(10, 5))
    credit_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), nullable=False, server_default=text("1.0")
    )
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    byok_only: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    tier: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'free'"))
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    notes: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("100"))
    price_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AiAction(Base):
    __tablename__ = "ai_actions"
    __table_args__ = (
        Index("ix_ai_actions_space_created", "space_id", text("created_at desc")),
        Index("ix_ai_actions_user_created", "user_id", text("created_at desc")),
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
    space_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[AiActionKind] = mapped_column(
        SQLEnum(
            AiActionKind,
            name="ai_action_kind",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    status: Mapped[AiActionStatus] = mapped_column(
        SQLEnum(
            AiActionStatus,
            name="ai_action_status",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=text("'pending'"),
    )
    recording_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("recordings.id", ondelete="SET NULL"),
        nullable=True,
    )
    transcript_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("transcripts.id", ondelete="SET NULL"),
        nullable=True,
    )
    provider: Mapped[ProviderId] = mapped_column(
        SQLEnum(
            ProviderId,
            name="provider_id",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    model_id: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_version: Mapped[str] = mapped_column(Text, nullable=False)
    billed_to: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'credits'"))
    credits_charged: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    raw_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    raw_response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AiActionItem(Base):
    __tablename__ = "ai_action_items"
    __table_args__ = (Index("ix_ai_action_items_action_sort", "ai_action_id", "sort_order"),)

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
    ai_action_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("ai_actions.id", ondelete="CASCADE"),
        nullable=False,
    )
    operation: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'sticky_note'")
    )
    target_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    forward_patch: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    inverse_patch: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    accepted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
