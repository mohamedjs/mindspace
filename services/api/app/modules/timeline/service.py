from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.timeline.models import TimelineEvent
from app.modules.timeline.repository import TimelineRepository


class TimelineService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._repo = TimelineRepository(session)

    async def list_for_space(
        self,
        space_id: UUID,
        *,
        user_id: UUID,
        limit: int = 50,
    ) -> Sequence[TimelineEvent]:
        return await self._repo.list_by_space(space_id, user_id=user_id, limit=limit)

    async def record_note_event(
        self,
        *,
        user_id: UUID,
        space_id: UUID,
        event_type: str,
        ref_id: UUID | None,
        summary: str,
    ) -> TimelineEvent:
        event = TimelineEvent(
            user_id=user_id,
            space_id=space_id,
            type=event_type,
            ref_id=ref_id,
            summary=summary,
        )
        return await self._repo.insert(event)
