from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.modules.ai.enums import ProviderId
from app.modules.byok.crypto import decrypt_api_key, encrypt_api_key, generate_key_hint
from app.modules.byok.models import UserAiKey
from app.modules.byok.repository import ByokRepository


class ByokService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._repo = ByokRepository(session)

    async def list_keys(self, user_id: UUID) -> Sequence[UserAiKey]:
        return await self._repo.list_for_user(user_id)

    async def save_key(
        self,
        *,
        user_id: UUID,
        provider: ProviderId,
        api_key: str,
        label: str | None = None,
        base_url: str | None = None,
    ) -> UserAiKey:
        encrypted = encrypt_api_key(api_key.strip())
        hint = generate_key_hint(api_key.strip())

        key = UserAiKey(
            user_id=user_id,
            provider=provider,
            label=label.strip() if label else None,
            encrypted_key=encrypted,
            key_hint=hint,
            base_url=base_url.strip() if base_url else None,
            is_active=True,
        )
        return await self._repo.create(key)

    async def get_decrypted_key(
        self,
        user_id: UUID,
        provider: ProviderId,
    ) -> tuple[str, str | None, UUID]:
        key = await self._repo.get_by_provider(user_id, provider)
        if key is None:
            raise NotFoundError(
                "byok_key_not_found",
                f"No active API key configured for provider {provider.value}",
            )
        plaintext = decrypt_api_key(key.encrypted_key)
        return plaintext, key.base_url, key.id

    async def record_key_usage(self, key_id: UUID, error: str | None = None) -> None:
        await self._repo.update_last_used(key_id, error=error)

    async def delete_key(self, key_id: UUID, user_id: UUID) -> None:
        rows = await self._repo.delete(key_id, user_id=user_id)
        if rows == 0:
            raise NotFoundError("key_not_found", "API key not found")
