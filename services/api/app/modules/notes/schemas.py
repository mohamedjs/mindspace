from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.modules.notes.enums import NoteType, RelType


class NoteOut(BaseModel):
    id: UUID
    title: str | None = None
    content: str
    type: NoteType
    color: str | None = None
    x: float
    y: float
    width: float
    height: float
    parent_id: UUID | None = None
    space_id: UUID
    due_at: datetime | None = None
    created_at: datetime


class NoteCreateRequest(BaseModel):
    content: str
    type: NoteType = NoteType.idea
    x: float
    y: float
    parent_id: UUID | None = None


class NoteContentPatch(BaseModel):
    title: str | None = None
    content: str


class NoteColorPatch(BaseModel):
    color: str | None = None


class NoteTypePatch(BaseModel):
    type: NoteType


class NotePositionPatch(BaseModel):
    x: float
    y: float


class NoteParentPatch(BaseModel):
    parent_id: UUID | None = None


class NoteMoveItem(BaseModel):
    id: UUID
    x: float
    y: float


class BulkMoveRequest(BaseModel):
    moves: list[NoteMoveItem]


class GroupOut(BaseModel):
    id: UUID
    title: str | None = None
    x: float
    y: float
    width: float
    height: float
    color: str | None = None


class GroupCreateRequest(BaseModel):
    title: str | None = None
    x: float
    y: float
    width: float | None = None
    height: float | None = None
    color: str | None = None


class GroupUpdateRequest(BaseModel):
    title: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    color: str | None = None


class RelationshipOut(BaseModel):
    id: UUID
    from_note_id: UUID
    to_note_id: UUID
    type: RelType
    created_by: str
    created_at: datetime
