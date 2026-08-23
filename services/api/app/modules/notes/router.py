from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.models import User
from app.modules.auth.deps import current_user
from app.modules.notes.schemas import (
    BulkMoveRequest,
    GroupCreateRequest,
    GroupOut,
    GroupUpdateRequest,
    NoteColorPatch,
    NoteContentPatch,
    NoteCreateRequest,
    NoteOut,
    NoteParentPatch,
    NotePositionPatch,
    NoteTypePatch,
    RelationshipOut,
)
from app.modules.notes.service import NoteService

notes_router = APIRouter(tags=["notes"])


# ---- Notes Endpoints ---------------------------------------------------------


@notes_router.get("/spaces/{space_id}/notes", response_model=list[NoteOut])
async def list_notes(
    space_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[NoteOut]:
    svc = NoteService(session)
    notes = await svc.list_live(space_id, user_id=user.id)
    return [
        NoteOut(
            id=n.id,
            title=n.title,
            content=n.content,
            type=n.type,
            color=n.color,
            x=n.x,
            y=n.y,
            width=n.width,
            height=n.height,
            parent_id=n.parent_id,
            space_id=n.space_id,
            due_at=n.due_at,
            created_at=n.created_at,
        )
        for n in notes
    ]


@notes_router.get("/notes/{note_id}", response_model=NoteOut)
async def get_note(
    note_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> NoteOut:
    svc = NoteService(session)
    n = await svc.get_owned(note_id, user_id=user.id)
    return NoteOut(
        id=n.id,
        title=n.title,
        content=n.content,
        type=n.type,
        color=n.color,
        x=n.x,
        y=n.y,
        width=n.width,
        height=n.height,
        parent_id=n.parent_id,
        space_id=n.space_id,
        due_at=n.due_at,
        created_at=n.created_at,
    )


@notes_router.post(
    "/spaces/{space_id}/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED
)
async def create_note(
    space_id: UUID,
    body: NoteCreateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> NoteOut:
    svc = NoteService(session)
    n = await svc.create(
        user_id=user.id,
        space_id=space_id,
        content=body.content,
        type=body.type,
        x=body.x,
        y=body.y,
        parent_id=body.parent_id,
    )
    return NoteOut(
        id=n.id,
        title=n.title,
        content=n.content,
        type=n.type,
        color=n.color,
        x=n.x,
        y=n.y,
        width=n.width,
        height=n.height,
        parent_id=n.parent_id,
        space_id=n.space_id,
        due_at=n.due_at,
        created_at=n.created_at,
    )


@notes_router.patch("/notes/{note_id}/content", status_code=status.HTTP_204_NO_CONTENT)
async def update_note_content(
    note_id: UUID,
    body: NoteContentPatch,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = NoteService(session)
    await svc.update_content(
        note_id,
        user_id=user.id,
        title=body.title,
        content=body.content,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@notes_router.patch("/notes/{note_id}/color", status_code=status.HTTP_204_NO_CONTENT)
async def update_note_color(
    note_id: UUID,
    body: NoteColorPatch,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = NoteService(session)
    await svc.update_color(note_id, user_id=user.id, color=body.color)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@notes_router.patch("/notes/{note_id}/type", status_code=status.HTTP_204_NO_CONTENT)
async def update_note_type(
    note_id: UUID,
    body: NoteTypePatch,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = NoteService(session)
    await svc.update_type(note_id, user_id=user.id, type=body.type)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@notes_router.patch("/notes/{note_id}/position", status_code=status.HTTP_204_NO_CONTENT)
async def update_note_position(
    note_id: UUID,
    body: NotePositionPatch,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = NoteService(session)
    await svc.update_position(note_id, user_id=user.id, x=body.x, y=body.y)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@notes_router.patch("/notes/{note_id}/parent", status_code=status.HTTP_204_NO_CONTENT)
async def update_note_parent(
    note_id: UUID,
    body: NoteParentPatch,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = NoteService(session)
    await svc.update_parent(note_id, user_id=user.id, parent_id=body.parent_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@notes_router.post("/notes/move", status_code=status.HTTP_204_NO_CONTENT)
async def move_many_notes(
    body: BulkMoveRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    if not body.moves:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    svc = NoteService(session)
    moves_tuple = [(m.id, m.x, m.y) for m in body.moves]
    await svc.move_many(moves_tuple, user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@notes_router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = NoteService(session)
    await svc.delete_note(note_id, user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- Groups Endpoints --------------------------------------------------------


@notes_router.get("/spaces/{space_id}/groups", response_model=list[GroupOut])
async def list_groups(
    space_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[GroupOut]:
    svc = NoteService(session)
    groups = await svc.list_groups(space_id, user_id=user.id)
    return [
        GroupOut(
            id=g.id,
            title=g.title,
            x=g.x,
            y=g.y,
            width=g.width,
            height=g.height,
            color=g.color,
        )
        for g in groups
    ]


@notes_router.post(
    "/spaces/{space_id}/groups", response_model=GroupOut, status_code=status.HTTP_201_CREATED
)
async def create_group(
    space_id: UUID,
    body: GroupCreateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupOut:
    svc = NoteService(session)
    g = await svc.create_group(
        user_id=user.id,
        space_id=space_id,
        title=body.title,
        x=body.x,
        y=body.y,
        width=body.width,
        height=body.height,
        color=body.color,
    )
    return GroupOut(
        id=g.id,
        title=g.title,
        x=g.x,
        y=g.y,
        width=g.width,
        height=g.height,
        color=g.color,
    )


@notes_router.patch("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_group(
    group_id: UUID,
    body: GroupUpdateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = NoteService(session)
    await svc.update_group(
        group_id,
        user_id=user.id,
        title=body.title,
        x=body.x,
        y=body.y,
        width=body.width,
        height=body.height,
        color=body.color,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@notes_router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = NoteService(session)
    await svc.delete_group(group_id, user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- Relationships Endpoint (Read-only) --------------------------------------


@notes_router.get("/spaces/{space_id}/relationships", response_model=list[RelationshipOut])
async def list_relationships(
    space_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[RelationshipOut]:
    svc = NoteService(session)
    rels = await svc.list_relationships(space_id, user_id=user.id)
    return [
        RelationshipOut(
            id=r.id,
            from_note_id=r.from_note_id,
            to_note_id=r.to_note_id,
            type=r.type,
            created_by=r.created_by,
            created_at=r.created_at,
        )
        for r in rels
    ]
