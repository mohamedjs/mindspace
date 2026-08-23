from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.modules.ai.enums import ProviderId
from app.modules.recordings.enums import RecordingStatus


class RecordingCreateRequest(BaseModel):
    duration_ms: int
    storage_path: str | None = None
    local_only: bool = True
    size_bytes: int | None = None
    mime_type: str = "audio/m4a"


class RecordingPatch(BaseModel):
    storage_path: str | None = None
    size_bytes: int | None = None
    status: RecordingStatus | None = None


class RecordingOut(BaseModel):
    id: UUID
    space_id: UUID
    storage_path: str | None = None
    local_only: bool
    duration_ms: int
    size_bytes: int | None = None
    mime_type: str
    status: RecordingStatus
    error: str | None = None
    created_at: datetime


class TranscribeRequest(BaseModel):
    recording_id: UUID
    model_id: str | None = None


class TranscriptOut(BaseModel):
    id: UUID
    recording_id: UUID
    text: str
    language: str | None = None
    provider: ProviderId
    model_id: str
    created_at: datetime
