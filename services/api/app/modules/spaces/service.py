from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.modules.spaces.models import Space
from app.modules.spaces.repository import SpaceRepository


class SpaceService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._repo = SpaceRepository(session)

    async def list_owned(self, user_id: UUID) -> Sequence[Space]:
        return await self._repo.list_for_user(user_id=user_id)

    async def get_owned(self, space_id: UUID, user_id: UUID) -> Space:
        space = await self._repo.get_owned(space_id, user_id=user_id)
        if space is None:
            raise NotFoundError("space_not_found", "Space not found")
        return space

    async def create(self, user_id: UUID, name: str, emoji: str = "💡") -> Space:
        space = Space(
            user_id=user_id,
            name=name.strip(),
            emoji=emoji or "💡",
        )
        return await self._repo.create(space)

    async def create_default_space(self, user_id: UUID) -> Space:
        space = Space(
            user_id=user_id,
            name="My MindSpace",
            emoji="💡",
        )
        return await self._repo.create(space)

    async def rename(self, space_id: UUID, user_id: UUID, name: str) -> None:
        rows = await self._repo.update_fields(
            space_id,
            user_id=user_id,
            name=name.strip(),
            updated_at=datetime.now(UTC),
        )
        if rows == 0:
            raise NotFoundError("space_not_found", "Space not found")

    async def delete(self, space_id: UUID, user_id: UUID) -> None:
        rows = await self._repo.update_fields(
            space_id,
            user_id=user_id,
            deleted_at=datetime.now(UTC),
        )
        if rows == 0:
            raise NotFoundError("space_not_found", "Space not found")

    async def touch(self, space_id: UUID) -> None:
        now = datetime.now(UTC)
        stmt = update(Space).where(Space.id == space_id).values(last_activity_at=now)
        await self._s.execute(stmt)

    async def adjust_note_count(self, space_id: UUID, delta: int) -> None:
        if delta == 0:
            return
        now = datetime.now(UTC)
        space = await self._s.get(Space, space_id)
        if space:
            new_count = max(0, space.note_count + delta)
            space.note_count = new_count
            space.last_activity_at = now
            await self._s.flush()
