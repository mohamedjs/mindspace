import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import anyio
import bcrypt
import jwt

from app.core.config import settings
from app.core.errors import InvalidTokenError, TokenExpiredError


def create_access_token(
    user_id: UUID | str,
    email: str | None = None,
    full_name: str | None = None,
    is_anonymous: bool = False,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(seconds=settings.api_access_token_ttl_seconds)

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "role": "authenticated",
        "aud": "authenticated",
        "iss": settings.api_jwt_issuer,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "user_metadata": {"full_name": full_name} if full_name else {},
        "is_anonymous": is_anonymous,
    }

    return jwt.encode(payload, settings.api_jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any]:
    # 1. Try with own API_JWT_SECRET
    try:
        return jwt.decode(
            token,
            settings.api_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError as err:
        raise TokenExpiredError() from err
    except jwt.PyJWTError:
        pass

    # 2. Cutover fallback: try with SUPABASE_JWT_SECRET if configured
    if settings.supabase_jwt_secret:
        try:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.ExpiredSignatureError as err:
            raise TokenExpiredError() from err
        except jwt.PyJWTError:
            pass

    raise InvalidTokenError()


def generate_opaque_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def hash_password(password: str) -> str:
    def _hash() -> str:
        salt = bcrypt.gensalt(rounds=10)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    return await anyio.to_thread.run_sync(_hash)


async def verify_password(plain_password: str, hashed_password: str) -> bool:
    def _verify() -> bool:
        try:
            return bcrypt.checkpw(
                plain_password.encode("utf-8"),
                hashed_password.encode("utf-8"),
            )
        except Exception:
            return False

    return await anyio.to_thread.run_sync(_verify)
