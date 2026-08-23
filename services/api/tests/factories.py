from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import Profile, User
from app.core.security import create_access_token, hash_password
from app.modules.credits.enums import LedgerReason
from app.modules.credits.models import CreditLedger
from app.modules.spaces.models import Space


class UserCtx:
    def __init__(
        self,
        user: User,
        profile: Profile,
        space: Space,
        token: str,
    ) -> None:
        self.user = user
        self.profile = profile
        self.space = space
        self.token = token
        self.headers = {"Authorization": f"Bearer {token}"}
        self.id = user.id


async def create_user_ctx(
    session: AsyncSession,
    email: str | None = None,
    password: str = "password123",
    full_name: str | None = "Test User",
    credits_balance: int = 1000,
) -> UserCtx:
    user_id = uuid4()
    email_val = email or f"user_{user_id.hex[:8]}@example.com"
    hashed_pw = await hash_password(password)

    user = User(
        id=user_id,
        email=email_val,
        encrypted_password=hashed_pw,
        is_anonymous=False,
        raw_user_meta_data={"full_name": full_name} if full_name else {},
        last_sign_in_at=datetime.now(UTC),
    )
    session.add(user)
    await session.flush()

    profile = Profile(
        id=user_id,
        display_name=full_name,
        is_anonymous=False,
        credits_balance=credits_balance,
        credits_reserved=0,
        free_refill_at=date.today(),
        timezone="Africa/Cairo",
        locale="en",
    )
    session.add(profile)
    await session.flush()

    ledger = CreditLedger(
        user_id=user_id,
        delta=credits_balance,
        balance_after=credits_balance,
        reason=LedgerReason.signup_grant,
    )
    session.add(ledger)

    space = Space(
        id=uuid4(),
        user_id=user_id,
        name="My MindSpace",
        emoji="💡",
    )
    session.add(space)

    await session.flush()

    token = create_access_token(
        user_id=user_id,
        email=email_val,
        full_name=full_name,
        is_anonymous=False,
    )

    return UserCtx(user=user, profile=profile, space=space, token=token)


def create_supabase_token(user_id: UUID, email: str, secret: str) -> str:
    now = int(datetime.now(UTC).timestamp())
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": "authenticated",
        "aud": "authenticated",
        "iss": "supabase",
        "iat": now,
        "exp": now + 3600,
        "user_metadata": {"full_name": "Supabase User"},
    }
    return jwt.encode(payload, secret, algorithm="HS256")
