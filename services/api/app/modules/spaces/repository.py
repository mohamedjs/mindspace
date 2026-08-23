from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.spaces.models import Space


class SpaceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_for_user(self, *, user_id: UUID) -> Sequence[Space]:
        stmt = (
            select(Space)
            .where(Space.user_id == user_id, Space.deleted_at.is_(None))
            .order_by(Space.last_activity_at.desc())
        )
        return (await self._s.scalars(stmt)).all()

    async def get_owned(self, space_id: UUID, *, user_id: UUID) -> Space | None:
        stmt = select(Space).where(
            Space.id == space_id,
            Space.user_id == user_id,
            Space.deleted_at.is_(None),
        )
        return await self._s.scalar(stmt)

    async def create(self, space: Space) -> Space:
        self._s.add(space)
        await self._s.flush()
        return space

    async def update_fields(self, space_id: UUID, *, user_id: UUID, **fields) -> int:
        stmt = (
            update(Space)
            .where(Space.id == space_id, Space.user_id == user_id, Space.deleted_at.is_(None))
            .values(**fields)
        )
        res = await self._s.execute(stmt)
        return res.rowcount
