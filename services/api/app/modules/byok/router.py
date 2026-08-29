from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.models import User
from app.modules.auth.deps import current_user
from app.modules.byok.schemas import KeyCreateRequest, KeyOut
from app.modules.byok.service import ByokService

byok_router = APIRouter(prefix="/byok/keys", tags=["byok"])


@byok_router.get("", response_model=list[KeyOut])
async def list_keys(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[KeyOut]:
    svc = ByokService(session)
    keys = await svc.list_keys(user.id)
    return [
        KeyOut(
            id=k.id,
            provider=k.provider,
            label=k.label,
            key_hint=k.key_hint,
            base_url=k.base_url,
            is_active=k.is_active,
            last_used_at=k.last_used_at,
            last_error=k.last_error,
            created_at=k.created_at,
        )
        for k in keys
    ]


@byok_router.post("", response_model=KeyOut, status_code=status.HTTP_201_CREATED)
async def create_key(
    body: KeyCreateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> KeyOut:
    svc = ByokService(session)
    k = await svc.save_key(
        user_id=user.id,
        provider=body.provider,
        api_key=body.api_key,
        label=body.label,
        base_url=body.base_url,
    )
    return KeyOut(
        id=k.id,
        provider=k.provider,
        label=k.label,
        key_hint=k.key_hint,
        base_url=k.base_url,
        is_active=k.is_active,
        last_used_at=k.last_used_at,
        last_error=k.last_error,
        created_at=k.created_at,
    )


@byok_router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_key(
    key_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = ByokService(session)
    await svc.delete_key(key_id, user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
