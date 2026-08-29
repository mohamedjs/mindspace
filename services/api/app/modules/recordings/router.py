from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.models import User
from app.modules.auth.deps import current_user
from app.modules.recordings.schemas import (
    RecordingCreateRequest,
    RecordingOut,
    TranscribeRequest,
    TranscriptOut,
)
from app.modules.recordings.service import RecordingService

recordings_router = APIRouter(tags=["recordings"])


@recordings_router.get(
    "/spaces/{space_id}/recordings",
    response_model=list[RecordingOut],
)
async def list_recordings(
    space_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[RecordingOut]:
    svc = RecordingService(session)
    recs = await svc.list_by_space(space_id, user_id=user.id)
    return [
        RecordingOut(
            id=r.id,
            space_id=r.space_id,
            storage_path=r.storage_path,
            local_only=r.local_only,
            duration_ms=r.duration_ms,
            size_bytes=r.size_bytes,
            mime_type=r.mime_type,
            status=r.status,
            error=r.error,
            created_at=r.created_at,
        )
        for r in recs
    ]


@recordings_router.post(
    "/spaces/{space_id}/recordings",
    response_model=RecordingOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_recording(
    space_id: UUID,
    body: RecordingCreateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> RecordingOut:
    svc = RecordingService(session)
    r = await svc.create(
        user_id=user.id,
        space_id=space_id,
        duration_ms=body.duration_ms,
        storage_path=body.storage_path,
        local_only=body.local_only,
        size_bytes=body.size_bytes,
        mime_type=body.mime_type,
    )
    return RecordingOut(
        id=r.id,
        space_id=r.space_id,
        storage_path=r.storage_path,
        local_only=r.local_only,
        duration_ms=r.duration_ms,
        size_bytes=r.size_bytes,
        mime_type=r.mime_type,
        status=r.status,
        error=r.error,
        created_at=r.created_at,
    )


@recordings_router.get(
    "/recordings/{recording_id}",
    response_model=RecordingOut,
)
async def get_recording(
    recording_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> RecordingOut:
    svc = RecordingService(session)
    r = await svc.get_owned(recording_id, user_id=user.id)
    return RecordingOut(
        id=r.id,
        space_id=r.space_id,
        storage_path=r.storage_path,
        local_only=r.local_only,
        duration_ms=r.duration_ms,
        size_bytes=r.size_bytes,
        mime_type=r.mime_type,
        status=r.status,
        error=r.error,
        created_at=r.created_at,
    )


@recordings_router.delete(
    "/recordings/{recording_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_recording(
    recording_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = RecordingService(session)
    await svc.delete(recording_id, user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@recordings_router.post(
    "/spaces/{space_id}/recordings/transcribe",
    response_model=TranscriptOut,
    status_code=status.HTTP_200_OK,
)
async def transcribe_recording(
    space_id: UUID,
    body: TranscribeRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> TranscriptOut:
    svc = RecordingService(session)
    tx = await svc.transcribe(
        recording_id=body.recording_id,
        user_id=user.id,
        model_id_override=body.model_id,
    )
    return TranscriptOut(
        id=tx.id,
        recording_id=tx.recording_id,
        text=tx.text,
        language=tx.language,
        provider=tx.provider,
        model_id=tx.model_id,
        created_at=tx.created_at,
    )


@recordings_router.get(
    "/recordings/{recording_id}/transcript",
    response_model=TranscriptOut,
)
async def get_transcript(
    recording_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> TranscriptOut:
    svc = RecordingService(session)
    tx = await svc.get_transcript(recording_id, user_id=user.id)
    return TranscriptOut(
        id=tx.id,
        recording_id=tx.recording_id,
        text=tx.text,
        language=tx.language,
        provider=tx.provider,
        model_id=tx.model_id,
        created_at=tx.created_at,
    )
