from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.modules.notes.enums import NoteType, SourceType
from app.modules.notes.models import NoteGroup, Relationship, StickyNote
from app.modules.notes.repository import GroupRepository, NoteRepository, RelationshipRepository
from app.modules.spaces.service import SpaceService
from app.modules.timeline.service import TimelineService


class NoteService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._note_repo = NoteRepository(session)
        self._group_repo = GroupRepository(session)
        self._rel_repo = RelationshipRepository(session)
        self._space_svc = SpaceService(session)
        self._timeline_svc = TimelineService(session)

    async def list_live(self, space_id: UUID, *, user_id: UUID) -> Sequence[StickyNote]:
        await self._space_svc.get_owned(space_id, user_id)
        return await self._note_repo.list_by_space(space_id, user_id=user_id)

    async def get_owned(self, note_id: UUID, *, user_id: UUID) -> StickyNote:
        note = await self._note_repo.get_owned(note_id, user_id=user_id)
        if note is None:
            raise NotFoundError("note_not_found", "Note not found")
        return note

    async def create(
        self,
        *,
        user_id: UUID,
        space_id: UUID,
        content: str,
        type: NoteType = NoteType.idea,
        x: float,
        y: float,
        parent_id: UUID | None = None,
        title: str | None = None,
        color: str | None = None,
        source_type: SourceType = SourceType.manual,
        recording_id: UUID | None = None,
        transcript_id: UUID | None = None,
        ai_action_id: UUID | None = None,
    ) -> StickyNote:
        # Check space ownership
        await self._space_svc.get_owned(space_id, user_id)

        # Check parent note ownership if specified
        if parent_id is not None:
            parent = await self._note_repo.get_owned(parent_id, user_id=user_id)
            if parent is None:
                raise NotFoundError("parent_note_not_found", "Parent note not found")

        note = StickyNote(
            user_id=user_id,
            space_id=space_id,
            title=title,
            content=content,
            type=type,
            color=color,
            x=x,
            y=y,
            parent_id=parent_id,
            source_type=source_type,
            recording_id=recording_id,
            transcript_id=transcript_id,
            ai_action_id=ai_action_id,
        )
        created_note = await self._note_repo.create(note)

        # 1. Timeline event
        summary = note.title or (note.content[:60] if note.content else "")
        await self._timeline_svc.record_note_event(
            user_id=user_id,
            space_id=space_id,
            event_type="note_created",
            ref_id=created_note.id,
            summary=summary,
        )

        # 2. Adjust note count (+1) and touch space
        await self._space_svc.adjust_note_count(space_id, delta=1)

        return created_note

    async def update_content(
        self,
        note_id: UUID,
        *,
        user_id: UUID,
        title: str | None,
        content: str,
    ) -> None:
        note = await self.get_owned(note_id, user_id=user_id)
        rows = await self._note_repo.update_fields(
            note_id,
            user_id=user_id,
            title=title,
            content=content,
        )
        if rows == 0:
            raise NotFoundError("note_not_found", "Note not found")

        summary = title or (content[:60] if content else "")
        await self._timeline_svc.record_note_event(
            user_id=user_id,
            space_id=note.space_id,
            event_type="note_updated",
            ref_id=note_id,
            summary=summary,
        )
        await self._space_svc.touch(note.space_id)

    async def update_color(
        self,
        note_id: UUID,
        *,
        user_id: UUID,
        color: str | None,
    ) -> None:
        note = await self.get_owned(note_id, user_id=user_id)
        rows = await self._note_repo.update_fields(note_id, user_id=user_id, color=color)
        if rows == 0:
            raise NotFoundError("note_not_found", "Note not found")
        await self._space_svc.touch(note.space_id)

    async def update_type(
        self,
        note_id: UUID,
        *,
        user_id: UUID,
        type: NoteType,
    ) -> None:
        note = await self.get_owned(note_id, user_id=user_id)
        rows = await self._note_repo.update_fields(note_id, user_id=user_id, type=type)
        if rows == 0:
            raise NotFoundError("note_not_found", "Note not found")

        summary = note.title or (note.content[:60] if note.content else "")
        await self._timeline_svc.record_note_event(
            user_id=user_id,
            space_id=note.space_id,
            event_type="note_updated",
            ref_id=note_id,
            summary=summary,
        )
        await self._space_svc.touch(note.space_id)

    async def update_position(
        self,
        note_id: UUID,
        *,
        user_id: UUID,
        x: float,
        y: float,
    ) -> None:
        note = await self.get_owned(note_id, user_id=user_id)
        rows = await self._note_repo.update_fields(note_id, user_id=user_id, x=x, y=y)
        if rows == 0:
            raise NotFoundError("note_not_found", "Note not found")
        # Position update must NOT emit timeline event!
        await self._space_svc.touch(note.space_id)

    async def update_parent(
        self,
        note_id: UUID,
        *,
        user_id: UUID,
        parent_id: UUID | None,
    ) -> None:
        note = await self.get_owned(note_id, user_id=user_id)
        if parent_id is not None:
            if parent_id == note_id:
                raise ValueError("Note cannot be its own parent")
            parent = await self._note_repo.get_owned(parent_id, user_id=user_id)
            if parent is None:
                raise NotFoundError("parent_note_not_found", "Parent note not found")

        rows = await self._note_repo.update_fields(note_id, user_id=user_id, parent_id=parent_id)
        if rows == 0:
            raise NotFoundError("note_not_found", "Note not found")
        await self._space_svc.touch(note.space_id)

    async def move_many(
        self,
        moves: list[tuple[UUID, float, float]],
        *,
        user_id: UUID,
    ) -> int:
        if not moves:
            return 0
        return await self._note_repo.move_many(moves, user_id=user_id)

    async def _soft_delete_note(self, note_id: UUID, *, user_id: UUID) -> None:
        note = await self.get_owned(note_id, user_id=user_id)

        # 1. Soft delete note
        rows = await self._note_repo.soft_delete(note_id, user_id=user_id)
        if rows == 0:
            raise NotFoundError("note_not_found", "Note not found")

        # 2. Promote children (parent_id = NULL)
        await self._note_repo.promote_children(note_id, user_id=user_id)

        # 3. Decrement note count (-1)
        await self._space_svc.adjust_note_count(note.space_id, delta=-1)

        # 4. Emit timeline event
        summary = note.title or (note.content[:60] if note.content else "")
        await self._timeline_svc.record_note_event(
            user_id=user_id,
            space_id=note.space_id,
            event_type="note_deleted",
            ref_id=note_id,
            summary=summary,
        )

    async def delete_note(self, note_id: UUID, *, user_id: UUID) -> None:
        await self._soft_delete_note(note_id, user_id=user_id)

    # ---- Groups --------------------------------------------------------------

    async def list_groups(self, space_id: UUID, *, user_id: UUID) -> Sequence[NoteGroup]:
        await self._space_svc.get_owned(space_id, user_id)
        return await self._group_repo.list_by_space(space_id, user_id=user_id)

    async def create_group(
        self,
        *,
        user_id: UUID,
        space_id: UUID,
        title: str | None = None,
        x: float,
        y: float,
        width: float | None = None,
        height: float | None = None,
        color: str | None = None,
    ) -> NoteGroup:
        await self._space_svc.get_owned(space_id, user_id)
        group = NoteGroup(
            user_id=user_id,
            space_id=space_id,
            title=title,
            x=x,
            y=y,
            width=width if width is not None else 460.0,
            height=height if height is not None else 360.0,
            color=color,
        )
        return await self._group_repo.create(group)

    async def update_group(
        self,
        group_id: UUID,
        *,
        user_id: UUID,
        **fields,
    ) -> None:
        valid_fields = {k: v for k, v in fields.items() if v is not None}
        if not valid_fields:
            return
        rows = await self._group_repo.update_fields(group_id, user_id=user_id, **valid_fields)
        if rows == 0:
            raise NotFoundError("group_not_found", "Group not found")

    async def delete_group(self, group_id: UUID, *, user_id: UUID) -> None:
        rows = await self._group_repo.soft_delete(group_id, user_id=user_id)
        if rows == 0:
            raise NotFoundError("group_not_found", "Group not found")

    # ---- Relationships -------------------------------------------------------

    async def list_relationships(
        self,
        space_id: UUID,
        *,
        user_id: UUID,
    ) -> Sequence[Relationship]:
        await self._space_svc.get_owned(space_id, user_id)
        return await self._rel_repo.list_by_space(space_id, user_id=user_id)
