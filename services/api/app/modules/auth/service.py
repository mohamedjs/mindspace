from datetime import UTC, date, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import EmailTakenError, InvalidCredentialsError, NotFoundError
from app.core.models import Profile, User
from app.core.security import create_access_token, hash_password, verify_password
from app.modules.auth.repository import ProfileRepository, UserRepository
from app.modules.auth.schemas import ProfileOut, TokenPair, UserOut
from app.modules.auth.tokens import (
    create_password_reset_token,
    create_refresh_token,
    revoke_refresh_token,
    verify_and_consume_password_reset_token,
    verify_and_rotate_refresh_token,
)
from app.modules.credits.service import CreditService
from app.modules.spaces.service import SpaceService


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._user_repo = UserRepository(session)
        self._profile_repo = ProfileRepository(session)
        self._credit_svc = CreditService(session)
        self._space_svc = SpaceService(session)

    async def register(
        self,
        email: str,
        password: str,
        full_name: str | None = None,
    ) -> TokenPair:
        normalized_email = email.strip().lower()
        existing = await self._user_repo.get_by_email(normalized_email)
        if existing is not None:
            raise EmailTakenError("An account with this email already exists")

        hashed_pw = await hash_password(password)
        user_id = uuid4()
        user_meta = {"full_name": full_name} if full_name else {}

        # 1. Insert User
        user = User(
            id=user_id,
            email=normalized_email,
            encrypted_password=hashed_pw,
            is_anonymous=False,
            raw_user_meta_data=user_meta,
            last_sign_in_at=datetime.now(UTC),
        )
        await self._user_repo.create(user)

        # 2. Insert Profile
        profile = Profile(
            id=user_id,
            display_name=full_name,
            is_anonymous=False,
            credits_balance=100,
            credits_reserved=0,
            free_refill_at=date.today(),
            timezone="Africa/Cairo",
            locale="en",
        )
        await self._profile_repo.create(profile)

        # 3. Insert Credit Ledger signup_grant (+100)
        await self._credit_svc.record_signup_grant(user_id, 100)

        # 4. Insert Default Space ("My MindSpace", "💡")
        await self._space_svc.create_default_space(user_id)

        # 5. Issue Tokens
        access_token = create_access_token(
            user_id=user.id,
            email=user.email,
            full_name=full_name,
            is_anonymous=False,
        )
        refresh_token = await create_refresh_token(self._s, user.id)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=3600,
            user=UserOut(
                id=user.id,
                email=user.email,
                user_metadata=user_meta,
                is_anonymous=False,
            ),
        )

    async def authenticate(self, email: str, password: str) -> TokenPair:
        normalized_email = email.strip().lower()
        user = await self._user_repo.get_by_email(normalized_email)
        if user is None or not user.encrypted_password:
            raise InvalidCredentialsError("Invalid email or password")

        valid = await verify_password(password, user.encrypted_password)
        if not valid:
            raise InvalidCredentialsError("Invalid email or password")

        user.last_sign_in_at = datetime.now(UTC)
        await self._s.flush()

        full_name = user.raw_user_meta_data.get("full_name") if user.raw_user_meta_data else None
        access_token = create_access_token(
            user_id=user.id,
            email=user.email,
            full_name=full_name,
            is_anonymous=user.is_anonymous,
        )
        refresh_token = await create_refresh_token(self._s, user.id)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=3600,
            user=UserOut(
                id=user.id,
                email=user.email,
                user_metadata=user.raw_user_meta_data or {},
                is_anonymous=user.is_anonymous,
            ),
        )

    async def refresh(self, raw_refresh_token: str) -> TokenPair:
        user, new_raw_refresh_token = await verify_and_rotate_refresh_token(
            self._s, raw_refresh_token
        )
        full_name = user.raw_user_meta_data.get("full_name") if user.raw_user_meta_data else None
        access_token = create_access_token(
            user_id=user.id,
            email=user.email,
            full_name=full_name,
            is_anonymous=user.is_anonymous,
        )
        return TokenPair(
            access_token=access_token,
            refresh_token=new_raw_refresh_token,
            token_type="bearer",
            expires_in=3600,
            user=UserOut(
                id=user.id,
                email=user.email,
                user_metadata=user.raw_user_meta_data or {},
                is_anonymous=user.is_anonymous,
            ),
        )

    async def sign_out(self, raw_refresh_token: str | None = None) -> None:
        if raw_refresh_token:
            await revoke_refresh_token(self._s, raw_refresh_token)

    async def request_password_reset(self, email: str) -> None:
        normalized_email = email.strip().lower()
        user = await self._user_repo.get_by_email(normalized_email)
        if user is not None:
            await create_password_reset_token(self._s, user.id)
            # Email delivery can be triggered here if SMTP configured

    async def confirm_password_reset(self, raw_token: str, new_password: str) -> None:
        user = await verify_and_consume_password_reset_token(self._s, raw_token)
        hashed_pw = await hash_password(new_password)
        user.encrypted_password = hashed_pw
        await self._s.flush()


class AccountService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._user_repo = UserRepository(session)
        self._profile_repo = ProfileRepository(session)

    async def get_profile(self, user_id: UUID) -> ProfileOut:
        user = await self._user_repo.get(user_id)
        if user is None:
            raise NotFoundError("user_not_found", "User not found")

        profile = await self._profile_repo.get(user_id)
        display_name = None
        if profile and profile.display_name:
            display_name = profile.display_name
        elif user.raw_user_meta_data and user.raw_user_meta_data.get("full_name"):
            display_name = user.raw_user_meta_data.get("full_name")

        return ProfileOut(display_name=display_name, email=user.email)

    async def update_display_name(self, user_id: UUID, display_name: str | None) -> None:
        updated = await self._profile_repo.update_display_name(user_id, display_name)
        if not updated:
            raise NotFoundError("profile_not_found", "Profile not found")

    async def delete_account(self, user_id: UUID) -> None:
        deleted = await self._user_repo.delete(user_id)
        if not deleted:
            raise NotFoundError("user_not_found", "User not found")
