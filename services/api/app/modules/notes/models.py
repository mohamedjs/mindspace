from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy import (
    Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.modules.notes.enums import NoteType, RelType, SourceType


class StickyNote(Base):
    __tablename__ = "sticky_notes"
    __table_args__ = (
        Index(
            "ix_sticky_notes_space_live",
            "space_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_sticky_notes_space_xy", "space_id", "x", "y"),
        Index("ix_sticky_notes_parent", "parent_id"),
        Index("ix_sticky_notes_recording", "recording_id"),
        Index(
            "ix_sticky_notes_space_due",
            "space_id",
            "due_at",
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
    space_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[NoteType] = mapped_column(
        SQLEnum(
            NoteType,
            name="note_type",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=text("'idea'"),
    )
    color: Mapped[str | None] = mapped_column(Text)
    x: Mapped[float] = mapped_column(Float(precision=24), nullable=False)
    y: Mapped[float] = mapped_column(Float(precision=24), nullable=False)
    width: Mapped[float] = mapped_column(
        Float(precision=24), nullable=False, server_default=text("180.0")
    )
    height: Mapped[float] = mapped_column(
        Float(precision=24), nullable=False, server_default=text("120.0")
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("sticky_notes.id", ondelete="SET NULL"),
        nullable=True,
    )
    z_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    source_type: Mapped[SourceType] = mapped_column(
        SQLEnum(
            SourceType,
            name="source_type",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=text("'manual'"),
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
    span_start: Mapped[int | None] = mapped_column(Integer)
    span_end: Mapped[int | None] = mapped_column(Integer)
    ai_action_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Relationship(Base):
    __tablename__ = "relationships"
    __table_args__ = (
        CheckConstraint("from_note_id <> to_note_id", name="no_self_link"),
        Index(
            "rel_unique",
            "from_note_id",
            "to_note_id",
            "type",
            unique=True,
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
    space_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_note_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("sticky_notes.id", ondelete="CASCADE"),
        nullable=False,
    )
    to_note_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("sticky_notes.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[RelType] = mapped_column(
        SQLEnum(
            RelType,
            name="rel_type",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=text("'related'"),
    )
    created_by: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'user'"))
    ai_action_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NoteGroup(Base):
    __tablename__ = "note_groups"
    __table_args__ = (
        Index(
            "ix_note_groups_space_live",
            "space_id",
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
    space_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(Text)
    x: Mapped[float] = mapped_column(Float(precision=24), nullable=False)
    y: Mapped[float] = mapped_column(Float(precision=24), nullable=False)
    width: Mapped[float] = mapped_column(
        Float(precision=24), nullable=False, server_default=text("460.0")
    )
    height: Mapped[float] = mapped_column(
        Float(precision=24), nullable=False, server_default=text("360.0")
    )
    color: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
