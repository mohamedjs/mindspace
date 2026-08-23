from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import InvalidTokenError, TokenExpiredError
from app.core.models import PasswordResetToken, RefreshToken, User
from app.core.security import generate_opaque_token, hash_token


async def create_refresh_token(
    session: AsyncSession,
    user_id: UUID,
    days: int | None = None,
) -> str:
    raw_token = generate_opaque_token(32)
    token_hash = hash_token(raw_token)
    ttl_days = days if days is not None else settings.api_refresh_token_ttl_days
    expires_at = datetime.now(UTC) + timedelta(days=ttl_days)

    refresh_token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(refresh_token)
    await session.flush()
    return raw_token


async def verify_and_rotate_refresh_token(
    session: AsyncSession,
    raw_token: str,
) -> tuple[User, str]:
    token_hash = hash_token(raw_token)
    stmt = (
        select(RefreshToken, User)
        .join(User, RefreshToken.user_id == User.id)
        .where(RefreshToken.token_hash == token_hash)
    )
    res = (await session.execute(stmt)).first()
    if not res:
        raise InvalidTokenError("invalid refresh token")

    token_obj, user = res
    now = datetime.now(UTC)

    if token_obj.revoked_at is not None:
        raise InvalidTokenError("refresh token revoked")

    if token_obj.expires_at < now:
        raise TokenExpiredError("refresh token expired")

    # Revoke old token
    token_obj.revoked_at = now

    # Issue new token
    new_raw_token = await create_refresh_token(session, user.id)
    return user, new_raw_token


async def revoke_refresh_token(session: AsyncSession, raw_token: str) -> None:
    token_hash = hash_token(raw_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    token_obj = await session.scalar(stmt)
    if token_obj and token_obj.revoked_at is None:
        token_obj.revoked_at = datetime.now(UTC)
        await session.flush()


async def create_password_reset_token(
    session: AsyncSession,
    user_id: UUID,
    minutes: int = 60,
) -> str:
    raw_token = generate_opaque_token(32)
    token_hash = hash_token(raw_token)
    expires_at = datetime.now(UTC) + timedelta(minutes=minutes)

    reset_token = PasswordResetToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(reset_token)
    await session.flush()
    return raw_token


async def verify_and_consume_password_reset_token(
    session: AsyncSession,
    raw_token: str,
) -> User:
    token_hash = hash_token(raw_token)
    stmt = (
        select(PasswordResetToken, User)
        .join(User, PasswordResetToken.user_id == User.id)
        .where(PasswordResetToken.token_hash == token_hash)
    )
    res = (await session.execute(stmt)).first()
    if not res:
        raise InvalidTokenError("invalid reset token")

    token_obj, user = res
    now = datetime.now(UTC)

    if token_obj.used_at is not None:
        raise InvalidTokenError("reset token already used")

    if token_obj.expires_at < now:
        raise TokenExpiredError("reset token expired")

    token_obj.used_at = now
    await session.flush()
    return user
