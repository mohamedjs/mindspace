from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import UnauthorizedError
from app.core.models import User
from app.core.security import decode_access_token
from app.modules.auth.repository import UserRepository

bearer = HTTPBearer(auto_error=False)


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    if creds is None:
        raise UnauthorizedError("missing Authorization header")
    try:
        claims = decode_access_token(creds.credentials)
    except Exception as err:
        raise UnauthorizedError("invalid token") from err

    sub = claims.get("sub")
    if not sub:
        raise UnauthorizedError("invalid token claims")

    try:
        user_id = UUID(sub)
    except (ValueError, TypeError) as err:
        raise UnauthorizedError("invalid user ID in token") from err

    user = await UserRepository(session).get(user_id)
    if user is None:
        raise UnauthorizedError("user not found")
    return user


async def current_user_optional(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    if creds is None:
        return None
    try:
        claims = decode_access_token(creds.credentials)
        sub = claims.get("sub")
        if not sub:
            return None
        user_id = UUID(sub)
        return await UserRepository(session).get(user_id)
    except Exception:
        return None
