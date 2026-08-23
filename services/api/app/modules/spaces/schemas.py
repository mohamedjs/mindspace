from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SpaceCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    emoji: str = "💡"


class SpaceUpdateRequest(BaseModel):
    name: str = Field(min_length=1)


class SpaceOut(BaseModel):
    id: UUID
    name: str
    emoji: str
    note_count: int
    last_activity_at: datetime
