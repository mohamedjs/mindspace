from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.models import User
from app.modules.ai.enums import ModelKind
from app.modules.ai.schemas import (
    AiActionItemOut,
    AiActionOut,
    AiModelOut,
    ExtractThoughtsRequest,
    WriteNoteRequest,
)
from app.modules.ai.service import AiService
from app.modules.auth.deps import current_user

ai_router = APIRouter(tags=["ai"])


@ai_router.get("/ai/models", response_model=list[AiModelOut])
async def list_models(
    kind: ModelKind | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> list[AiModelOut]:
    svc = AiService(session)
    models = await svc.list_models(kind=kind)
    return [
        AiModelOut(
            id=m.id,
            provider=m.provider,
            model_id=m.model_id,
            display_name=m.display_name,
            kind=m.kind,
            credit_multiplier=float(m.credit_multiplier),
            is_default=m.is_default,
            byok_only=m.byok_only,
            tier=m.tier,
            enabled=m.enabled,
        )
        for m in models
    ]


@ai_router.post(
    "/spaces/{space_id}/ai/extract",
    response_model=AiActionOut,
    status_code=status.HTTP_200_OK,
)
async def extract_thoughts(
    space_id: UUID,
    body: ExtractThoughtsRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> AiActionOut:
    svc = AiService(session)
    action, items = await svc.extract_thoughts(
        user_id=user.id,
        space_id=space_id,
        transcript_id=body.transcript_id,
        parent_note_id=body.parent_note_id,
    )
    return AiActionOut(
        id=action.id,
        kind=action.kind,
        status=action.status,
        recording_id=action.recording_id,
        transcript_id=action.transcript_id,
        provider=action.provider,
        model_id=action.model_id,
        billed_to=action.billed_to,
        credits_charged=action.credits_charged,
        created_at=action.created_at,
        items=[
            AiActionItemOut(
                id=item.id,
                operation=item.operation,
                target_type=item.target_type,
                target_id=item.target_id,
                forward_patch=item.forward_patch,
                inverse_patch=item.inverse_patch,
                accepted=item.accepted,
                applied_at=item.applied_at,
            )
            for item in items
        ],
    )


@ai_router.post(
    "/spaces/{space_id}/ai/note-write",
    response_model=AiActionOut,
    status_code=status.HTTP_200_OK,
)
async def write_note(
    space_id: UUID,
    body: WriteNoteRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> AiActionOut:
    svc = AiService(session)
    action, items = await svc.write_note(
        user_id=user.id,
        space_id=space_id,
        note_id=body.note_id,
        transcript_id=body.transcript_id,
    )
    return AiActionOut(
        id=action.id,
        kind=action.kind,
        status=action.status,
        recording_id=action.recording_id,
        transcript_id=action.transcript_id,
        provider=action.provider,
        model_id=action.model_id,
        billed_to=action.billed_to,
        credits_charged=action.credits_charged,
        created_at=action.created_at,
        items=[
            AiActionItemOut(
                id=item.id,
                operation=item.operation,
                target_type=item.target_type,
                target_id=item.target_id,
                forward_patch=item.forward_patch,
                inverse_patch=item.inverse_patch,
                accepted=item.accepted,
                applied_at=item.applied_at,
            )
            for item in items
        ],
    )


@ai_router.post("/ai/actions/{action_id}/undo", status_code=status.HTTP_204_NO_CONTENT)
async def undo_ai_action(
    action_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = AiService(session)
    await svc.undo_action(action_id, user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
