from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notes.models import NoteGroup, Relationship, StickyNote


class NoteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_space(
        self,
        space_id: UUID,
        *,
        user_id: UUID,
    ) -> Sequence[StickyNote]:
        stmt = (
            select(StickyNote)
            .where(
                StickyNote.space_id == space_id,
                StickyNote.user_id == user_id,
                StickyNote.deleted_at.is_(None),
            )
            .order_by(StickyNote.created_at.asc())
        )
        return (await self._s.scalars(stmt)).all()

    async def get_owned(
        self,
        note_id: UUID,
        *,
        user_id: UUID,
    ) -> StickyNote | None:
        stmt = select(StickyNote).where(
            StickyNote.id == note_id,
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
        )
        return await self._s.scalar(stmt)

    async def create(self, note: StickyNote) -> StickyNote:
        self._s.add(note)
        await self._s.flush()
        return note

    async def create_many(self, notes: list[StickyNote]) -> Sequence[StickyNote]:
        self._s.add_all(notes)
        await self._s.flush()
        return notes

    async def update_fields(
        self,
        note_id: UUID,
        *,
        user_id: UUID,
        **fields: Any,
    ) -> int:
        fields["updated_at"] = datetime.now(UTC)
        stmt = (
            update(StickyNote)
            .where(
                StickyNote.id == note_id,
                StickyNote.user_id == user_id,
                StickyNote.deleted_at.is_(None),
            )
            .values(**fields)
        )
        res = await self._s.execute(stmt)
        return res.rowcount

    async def promote_children(
        self,
        parent_id: UUID,
        *,
        user_id: UUID,
    ) -> int:
        stmt = (
            update(StickyNote)
            .where(
                StickyNote.parent_id == parent_id,
                StickyNote.user_id == user_id,
                StickyNote.deleted_at.is_(None),
            )
            .values(parent_id=None, updated_at=datetime.now(UTC))
        )
        res = await self._s.execute(stmt)
        return res.rowcount

    async def soft_delete(
        self,
        note_id: UUID,
        *,
        user_id: UUID,
    ) -> int:
        now = datetime.now(UTC)
        stmt = (
            update(StickyNote)
            .where(
                StickyNote.id == note_id,
                StickyNote.user_id == user_id,
                StickyNote.deleted_at.is_(None),
            )
            .values(deleted_at=now, updated_at=now)
        )
        res = await self._s.execute(stmt)
        return res.rowcount

    async def move_many(
        self,
        moves: list[tuple[UUID, float, float]],
        *,
        user_id: UUID,
    ) -> int:
        if not moves:
            return 0

        # Construct single batch UPDATE from VALUES
        # moves is list of (id, x, y)
        values_clause = ", ".join(f"('{m[0]}'::uuid, {m[1]}::real, {m[2]}::real)" for m in moves)
        sql = f"""
            UPDATE sticky_notes AS n
            SET x = v.x, y = v.y, updated_at = now()
            FROM (VALUES {values_clause}) AS v(id, x, y)
            WHERE n.id = v.id AND n.user_id = :user_id AND n.deleted_at IS NULL
        """
        res = await self._s.execute(text(sql), {"user_id": user_id})
        return res.rowcount


class GroupRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_space(
        self,
        space_id: UUID,
        *,
        user_id: UUID,
    ) -> Sequence[NoteGroup]:
        stmt = (
            select(NoteGroup)
            .where(
                NoteGroup.space_id == space_id,
                NoteGroup.user_id == user_id,
                NoteGroup.deleted_at.is_(None),
            )
            .order_by(NoteGroup.created_at.asc())
        )
        return (await self._s.scalars(stmt)).all()

    async def get_owned(
        self,
        group_id: UUID,
        *,
        user_id: UUID,
    ) -> NoteGroup | None:
        stmt = select(NoteGroup).where(
            NoteGroup.id == group_id,
            NoteGroup.user_id == user_id,
            NoteGroup.deleted_at.is_(None),
        )
        return await self._s.scalar(stmt)

    async def create(self, group: NoteGroup) -> NoteGroup:
        self._s.add(group)
        await self._s.flush()
        return group

    async def update_fields(
        self,
        group_id: UUID,
        *,
        user_id: UUID,
        **fields: Any,
    ) -> int:
        stmt = (
            update(NoteGroup)
            .where(
                NoteGroup.id == group_id,
                NoteGroup.user_id == user_id,
                NoteGroup.deleted_at.is_(None),
            )
            .values(**fields)
        )
        res = await self._s.execute(stmt)
        return res.rowcount

    async def soft_delete(
        self,
        group_id: UUID,
        *,
        user_id: UUID,
    ) -> int:
        stmt = (
            update(NoteGroup)
            .where(
                NoteGroup.id == group_id,
                NoteGroup.user_id == user_id,
                NoteGroup.deleted_at.is_(None),
            )
            .values(deleted_at=datetime.now(UTC))
        )
        res = await self._s.execute(stmt)
        return res.rowcount


class RelationshipRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_space(
        self,
        space_id: UUID,
        *,
        user_id: UUID,
    ) -> Sequence[Relationship]:
        stmt = (
            select(Relationship)
            .where(
                Relationship.space_id == space_id,
                Relationship.user_id == user_id,
                Relationship.deleted_at.is_(None),
            )
            .order_by(Relationship.created_at.asc())
        )
        return (await self._s.scalars(stmt)).all()

    async def create(self, rel: Relationship) -> Relationship:
        self._s.add(rel)
        await self._s.flush()
        return rel

    async def create_many(self, rels: list[Relationship]) -> Sequence[Relationship]:
        self._s.add_all(rels)
        await self._s.flush()
        return rels
