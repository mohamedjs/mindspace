from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.recordings.models import Recording, Transcript


class RecordingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_space(self, space_id: UUID, *, user_id: UUID) -> Sequence[Recording]:
        stmt = (
            select(Recording)
            .where(Recording.space_id == space_id, Recording.user_id == user_id)
            .order_by(Recording.created_at.desc())
        )
        return (await self._s.scalars(stmt)).all()

    async def get_owned(self, recording_id: UUID, *, user_id: UUID) -> Recording | None:
        stmt = select(Recording).where(
            Recording.id == recording_id,
            Recording.user_id == user_id,
        )
        return await self._s.scalar(stmt)

    async def create(self, recording: Recording) -> Recording:
        self._s.add(recording)
        await self._s.flush()
        return recording

    async def update_fields(self, recording_id: UUID, *, user_id: UUID, **fields) -> int:
        stmt = (
            update(Recording)
            .where(Recording.id == recording_id, Recording.user_id == user_id)
            .values(**fields)
        )
        res = await self._s.execute(stmt)
        return res.rowcount

    async def delete(self, recording_id: UUID, *, user_id: UUID) -> int:
        stmt = delete(Recording).where(
            Recording.id == recording_id,
            Recording.user_id == user_id,
        )
        res = await self._s.execute(stmt)
        return res.rowcount


class TranscriptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_by_recording(self, recording_id: UUID, *, user_id: UUID) -> Transcript | None:
        stmt = select(Transcript).where(
            Transcript.recording_id == recording_id,
            Transcript.user_id == user_id,
        )
        return await self._s.scalar(stmt)

    async def get_owned(self, transcript_id: UUID, *, user_id: UUID) -> Transcript | None:
        stmt = select(Transcript).where(
            Transcript.id == transcript_id,
            Transcript.user_id == user_id,
        )
        return await self._s.scalar(stmt)

    async def create(self, transcript: Transcript) -> Transcript:
        self._s.add(transcript)
        await self._s.flush()
        return transcript
