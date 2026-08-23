from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TimelineEventOut(BaseModel):
    id: UUID
    type: str
    ref_id: UUID | None = None
    summary: str
    created_at: datetime
