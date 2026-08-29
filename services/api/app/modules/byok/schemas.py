from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.ai.enums import ProviderId


class KeyCreateRequest(BaseModel):
    provider: ProviderId
    api_key: str = Field(min_length=1)
    label: str | None = None
    base_url: str | None = None


class KeyOut(BaseModel):
    id: UUID
    provider: ProviderId
    label: str | None = None
    key_hint: str
    base_url: str | None = None
    is_active: bool
    last_used_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime
