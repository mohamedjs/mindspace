from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.models import User
from app.modules.auth.deps import current_user
from app.modules.spaces.service import SpaceService
from app.modules.timeline.schemas import TimelineEventOut
from app.modules.timeline.service import TimelineService

timeline_router = APIRouter(prefix="/spaces/{space_id}/timeline", tags=["timeline"])


@timeline_router.get("", response_model=list[TimelineEventOut])
async def list_timeline(
    space_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TimelineEventOut]:
    # Check space ownership
    space_svc = SpaceService(session)
    await space_svc.get_owned(space_id, user.id)

    timeline_svc = TimelineService(session)
    events = await timeline_svc.list_for_space(space_id, user_id=user.id, limit=limit)
    return [
        TimelineEventOut(
            id=e.id,
            type=e.type,
            ref_id=e.ref_id,
            summary=e.summary,
            created_at=e.created_at,
        )
        for e in events
    ]
