from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    email: Mapped[str | None] = mapped_column(Text, unique=True, index=True)
    encrypted_password: Mapped[str | None] = mapped_column(Text)
    email_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_anonymous: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    raw_user_meta_data: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_sign_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint("credits_balance >= 0", name="credits_non_negative"),
        CheckConstraint("credits_reserved >= 0", name="reserved_non_negative"),
    )

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    display_name: Mapped[str | None] = mapped_column(Text)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    credits_balance: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    credits_reserved: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    free_refill_at: Mapped[date | None] = mapped_column(Date)
    chat_model_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("ai_models.id", ondelete="SET NULL"),
        nullable=True,
    )
    transcribe_model_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("ai_models.id", ondelete="SET NULL"),
        nullable=True,
    )
    timezone: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'Africa/Cairo'")
    )
    locale: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'en'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

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
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

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
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
