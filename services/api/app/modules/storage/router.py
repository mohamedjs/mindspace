from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.models import User
from app.modules.auth.deps import current_user
from app.modules.spaces.service import SpaceService
from app.modules.storage.schemas import PresignedUploadOut, PresignedUploadRequest
from app.modules.storage.service import StorageService

storage_router = APIRouter(tags=["storage"])


@storage_router.post(
    "/spaces/{space_id}/recordings/presigned-upload",
    response_model=PresignedUploadOut,
)
async def create_presigned_upload(
    space_id: UUID,
    body: PresignedUploadRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> PresignedUploadOut:
    space_svc = SpaceService(session)
    await space_svc.get_owned(space_id, user.id)

    storage_svc = StorageService()
    url, path = await storage_svc.generate_presigned_upload_url(
        user_id=user.id,
        space_id=space_id,
        filename=body.filename,
        content_type=body.content_type,
    )
    return PresignedUploadOut(upload_url=url, storage_path=path)
