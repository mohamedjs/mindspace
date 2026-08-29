from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class Space(Base):
    __tablename__ = "spaces"
    __table_args__ = (
        Index(
            "ix_spaces_user_activity",
            "user_id",
            text("last_activity_at desc"),
            postgresql_where=text("deleted_at IS NULL"),
        ),
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
    name: Mapped[str] = mapped_column(Text, nullable=False)
    emoji: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'💡'"))
    canvas_zoom: Mapped[float] = mapped_column(
        Float(precision=24), nullable=False, server_default=text("1.0")
    )
    canvas_x: Mapped[float] = mapped_column(
        Float(precision=24), nullable=False, server_default=text("0.0")
    )
    canvas_y: Mapped[float] = mapped_column(
        Float(precision=24), nullable=False, server_default=text("0.0")
    )
    note_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
