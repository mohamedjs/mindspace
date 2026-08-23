from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import Profile, User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get(self, user_id: UUID) -> User | None:
        return await self._s.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email.strip().lower())
        return await self._s.scalar(stmt)

    async def create(self, user: User) -> User:
        self._s.add(user)
        await self._s.flush()
        return user

    async def delete(self, user_id: UUID) -> bool:
        stmt = delete(User).where(User.id == user_id)
        res = await self._s.execute(stmt)
        return res.rowcount > 0


class ProfileRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get(self, user_id: UUID) -> Profile | None:
        return await self._s.get(Profile, user_id)

    async def create(self, profile: Profile) -> Profile:
        self._s.add(profile)
        await self._s.flush()
        return profile

    async def update_display_name(self, user_id: UUID, display_name: str | None) -> bool:
        stmt = update(Profile).where(Profile.id == user_id).values(display_name=display_name)
        res = await self._s.execute(stmt)
        return res.rowcount > 0
