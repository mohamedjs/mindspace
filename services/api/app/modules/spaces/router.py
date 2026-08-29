from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.models import User
from app.modules.auth.deps import current_user
from app.modules.spaces.schemas import SpaceCreateRequest, SpaceOut, SpaceUpdateRequest
from app.modules.spaces.service import SpaceService

spaces_router = APIRouter(prefix="/spaces", tags=["spaces"])


@spaces_router.get("", response_model=list[SpaceOut])
async def list_spaces(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[SpaceOut]:
    svc = SpaceService(session)
    spaces = await svc.list_owned(user.id)
    return [
        SpaceOut(
            id=s.id,
            name=s.name,
            emoji=s.emoji,
            note_count=s.note_count,
            last_activity_at=s.last_activity_at,
        )
        for s in spaces
    ]


@spaces_router.post("", response_model=SpaceOut, status_code=status.HTTP_201_CREATED)
async def create_space(
    body: SpaceCreateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> SpaceOut:
    svc = SpaceService(session)
    s = await svc.create(user.id, name=body.name, emoji=body.emoji or "💡")
    return SpaceOut(
        id=s.id,
        name=s.name,
        emoji=s.emoji,
        note_count=s.note_count,
        last_activity_at=s.last_activity_at,
    )


@spaces_router.patch("/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_space(
    space_id: UUID,
    body: SpaceUpdateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = SpaceService(session)
    await svc.rename(space_id, user.id, name=body.name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@spaces_router.delete("/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_space(
    space_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = SpaceService(session)
    await svc.delete(space_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
