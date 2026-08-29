from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.ai.enums import AiActionKind, AiActionStatus, ModelKind, ProviderId


class AiModelOut(BaseModel):
    id: UUID
    provider: ProviderId
    model_id: str
    display_name: str
    kind: ModelKind
    credit_multiplier: float
    is_default: bool
    byok_only: bool
    tier: str
    enabled: bool


class ExtractThoughtsRequest(BaseModel):
    transcript_id: UUID
    parent_note_id: UUID | None = None


class WriteNoteRequest(BaseModel):
    note_id: UUID
    transcript_id: UUID


class DetectRelationsRequest(BaseModel):
    note_ids: list[UUID] | None = None


class ActionApplyRequest(BaseModel):
    item_ids: list[UUID] | None = None


class AiActionItemOut(BaseModel):
    id: UUID
    operation: str
    target_type: str
    target_id: UUID | None = None
    forward_patch: dict[str, Any]
    inverse_patch: dict[str, Any]
    accepted: bool
    applied_at: datetime | None = None


class AiActionOut(BaseModel):
    id: UUID
    kind: AiActionKind
    status: AiActionStatus
    recording_id: UUID | None = None
    transcript_id: UUID | None = None
    provider: ProviderId
    model_id: str
    billed_to: str
    credits_charged: int
    items: list[AiActionItemOut] = Field(default_factory=list)
    created_at: datetime
