from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.enums import ProviderId
from app.modules.byok.models import UserAiKey


class ByokRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_for_user(self, user_id: UUID) -> Sequence[UserAiKey]:
        stmt = (
            select(UserAiKey)
            .where(UserAiKey.user_id == user_id)
            .order_by(UserAiKey.created_at.desc())
        )
        return (await self._s.scalars(stmt)).all()

    async def get_owned(self, key_id: UUID, *, user_id: UUID) -> UserAiKey | None:
        stmt = select(UserAiKey).where(
            UserAiKey.id == key_id,
            UserAiKey.user_id == user_id,
        )
        return await self._s.scalar(stmt)

    async def get_by_provider(self, user_id: UUID, provider: ProviderId) -> UserAiKey | None:
        stmt = (
            select(UserAiKey)
            .where(
                UserAiKey.user_id == user_id,
                UserAiKey.provider == provider,
                UserAiKey.is_active.is_(True),
            )
            .order_by(UserAiKey.created_at.desc())
        )
        return await self._s.scalar(stmt)

    async def create(self, key: UserAiKey) -> UserAiKey:
        self._s.add(key)
        await self._s.flush()
        return key

    async def delete(self, key_id: UUID, *, user_id: UUID) -> int:
        stmt = delete(UserAiKey).where(
            UserAiKey.id == key_id,
            UserAiKey.user_id == user_id,
        )
        res = await self._s.execute(stmt)
        return res.rowcount

    async def update_last_used(
        self,
        key_id: UUID,
        *,
        error: str | None = None,
    ) -> None:
        stmt = (
            update(UserAiKey)
            .where(UserAiKey.id == key_id)
            .values(last_used_at=datetime.now(UTC), last_error=error)
        )
        await self._s.execute(stmt)
