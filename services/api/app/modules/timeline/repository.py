from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.timeline.models import TimelineEvent


class TimelineRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_space(
        self,
        space_id: UUID,
        *,
        user_id: UUID,
        limit: int = 50,
    ) -> Sequence[TimelineEvent]:
        stmt = (
            select(TimelineEvent)
            .where(TimelineEvent.space_id == space_id, TimelineEvent.user_id == user_id)
            .order_by(TimelineEvent.created_at.desc())
            .limit(limit)
        )
        return (await self._s.scalars(stmt)).all()

    async def insert(self, event: TimelineEvent) -> TimelineEvent:
        self._s.add(event)
        await self._s.flush()
        return event
