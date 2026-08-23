from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
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
from app.modules.ai.enums import ProviderId
from app.modules.recordings.enums import RecordingStatus


class Recording(Base):
    __tablename__ = "recordings"
    __table_args__ = (Index("ix_recordings_space_created", "space_id", text("created_at desc")),)

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
    storage_path: Mapped[str | None] = mapped_column(Text)
    local_only: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'audio/m4a'"))
    status: Mapped[RecordingStatus] = mapped_column(
        SQLEnum(
            RecordingStatus,
            name="recording_status",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=text("'recorded'"),
    )
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Transcript(Base):
    __tablename__ = "transcripts"
    __table_args__ = (Index("ix_transcripts_recording", "recording_id"),)

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
    recording_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("recordings.id", ondelete="CASCADE"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str | None] = mapped_column(Text)
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
