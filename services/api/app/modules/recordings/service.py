import math
import os
from collections.abc import Sequence
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, NotFoundError
from app.core.models import Profile
from app.modules.ai.enums import ModelKind, ProviderId
from app.modules.ai.models import AiModel
from app.modules.ai.providers.factory import get_chat_provider
from app.modules.ai.repository import AiModelRepository
from app.modules.byok.service import ByokService
from app.modules.credits.enums import LedgerReason
from app.modules.credits.models import CreditLedger
from app.modules.credits.service import CreditService
from app.modules.recordings.enums import RecordingStatus
from app.modules.recordings.models import Recording, Transcript
from app.modules.recordings.repository import RecordingRepository, TranscriptRepository
from app.modules.spaces.service import SpaceService
from app.modules.storage.service import StorageService
from app.modules.timeline.service import TimelineService

CREDITS_PER_MINUTE = 6


class RecordingService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._rec_repo = RecordingRepository(session)
        self._tx_repo = TranscriptRepository(session)
        self._model_repo = AiModelRepository(session)
        self._byok_svc = ByokService(session)
        self._credit_svc = CreditService(session)
        self._space_svc = SpaceService(session)
        self._storage_svc = StorageService()
        self._timeline_svc = TimelineService(session)

    async def list_by_space(self, space_id: UUID, *, user_id: UUID) -> Sequence[Recording]:
        await self._space_svc.get_owned(space_id, user_id)
        return await self._rec_repo.list_by_space(space_id, user_id=user_id)

    async def get_owned(self, recording_id: UUID, *, user_id: UUID) -> Recording:
        rec = await self._rec_repo.get_owned(recording_id, user_id=user_id)
        if rec is None:
            raise NotFoundError("recording_not_found", "Recording not found")
        return rec

    async def get_transcript(self, recording_id: UUID, *, user_id: UUID) -> Transcript:
        tx = await self._tx_repo.get_by_recording(recording_id, user_id=user_id)
        if tx is None:
            raise NotFoundError("transcript_not_found", "Transcript not found for recording")
        return tx

    async def create(
        self,
        *,
        user_id: UUID,
        space_id: UUID,
        duration_ms: int,
        storage_path: str | None = None,
        local_only: bool = True,
        size_bytes: int | None = None,
        mime_type: str = "audio/m4a",
    ) -> Recording:
        await self._space_svc.get_owned(space_id, user_id)
        rec = Recording(
            id=uuid4(),
            user_id=user_id,
            space_id=space_id,
            duration_ms=duration_ms,
            storage_path=storage_path,
            local_only=local_only,
            size_bytes=size_bytes,
            mime_type=mime_type,
            status=RecordingStatus.uploaded if storage_path else RecordingStatus.recorded,
        )
        return await self._rec_repo.create(rec)

    async def delete(self, recording_id: UUID, *, user_id: UUID) -> None:
        rec = await self.get_owned(recording_id, user_id=user_id)
        if rec.storage_path:
            try:
                await self._storage_svc.delete_file(rec.storage_path)
            except Exception:
                pass
        await self._rec_repo.delete(recording_id, user_id=user_id)

    async def resolve_transcribe_model(
        self, user_id: UUID, model_id_override: str | None = None
    ) -> AiModel:
        if model_id_override:
            # Look up model by model_id string
            stmt = select(AiModel).where(
                AiModel.model_id == model_id_override,
                AiModel.kind == ModelKind.transcribe,
                AiModel.enabled.is_(True),
            )
            m = await self._s.scalar(stmt)
            if m:
                return m

        profile = await self._s.get(Profile, user_id)
        if profile and profile.transcribe_model_id:
            model = await self._model_repo.get_by_id(profile.transcribe_model_id)
            if model and model.enabled:
                return model

        default_model = await self._model_repo.get_default(ModelKind.transcribe)
        if default_model is None:
            raise AppError("no_default_model", "No default transcribe model configured", 500)
        return default_model

    async def resolve_api_key(
        self,
        user_id: UUID,
        model: AiModel,
    ) -> tuple[str, str | None, bool]:
        try:
            byok_key, base_url, _ = await self._byok_svc.get_decrypted_key(user_id, model.provider)
            return byok_key, base_url, False
        except NotFoundError:
            pass

        if model.byok_only:
            raise AppError(
                "byok_key_required",
                f"Model {model.display_name} requires a configured BYOK API key for {model.provider.value}",
                400,
            )

        platform_key = None
        if model.provider == ProviderId.openrouter:
            platform_key = settings.platform_openrouter_key
        elif model.provider == ProviderId.openai:
            platform_key = settings.platform_openai_key
        elif model.provider == ProviderId.google:
            platform_key = settings.platform_google_key
        elif model.provider == ProviderId.anthropic:
            platform_key = settings.platform_anthropic_key
        elif model.provider == ProviderId.nvidia:
            platform_key = settings.platform_nvidia_key

        if not platform_key:
            if settings.platform_openrouter_key:
                return settings.platform_openrouter_key, None, True
            raise AppError(
                "missing_platform_key",
                f"No API key configured for provider {model.provider.value}",
                500,
            )

        return platform_key, None, True

    async def _is_free_plan(self, user_id: UUID) -> bool:
        stmt = select(func.count(CreditLedger.id)).where(
            CreditLedger.user_id == user_id,
            CreditLedger.reason == LedgerReason.purchase,
        )
        count = await self._s.scalar(stmt)
        return (count or 0) == 0

    async def transcribe(
        self,
        recording_id: UUID,
        *,
        user_id: UUID,
        model_id_override: str | None = None,
    ) -> Transcript:
        rec = await self.get_owned(recording_id, user_id=user_id)
        if not rec.storage_path:
            raise AppError("recording_not_uploaded", "Recording has no uploaded audio file", 400)

        model = await self.resolve_transcribe_model(user_id, model_id_override)
        api_key, base_url, uses_platform_key = await self.resolve_api_key(user_id, model)

        # Estimate & reserve credits
        minutes = max(1.0, rec.duration_ms / 60000.0)
        estimated_credits = math.ceil(CREDITS_PER_MINUTE * minutes * float(model.credit_multiplier))
        reservation_id: UUID | None = None
        if uses_platform_key:
            reservation_id = await self._credit_svc.reserve(user_id, estimated_credits)

        rec.status = RecordingStatus.transcribing
        rec.error = None
        await self._s.flush()

        try:
            # Download audio bytes
            audio_bytes = await self._storage_svc.download_bytes(rec.storage_path)
            format_ext = os.path.splitext(rec.storage_path)[1].lstrip(".") or "m4a"

            provider = get_chat_provider(model.provider, api_key, base_url)

            if model.provider == ProviderId.openrouter:
                text, lang = await provider.transcribe_via_chat(  # type: ignore[attr-defined]
                    model_id=model.model_id,
                    audio_bytes=audio_bytes,
                    audio_format=format_ext,
                )
            else:
                text, lang = await provider.transcribe(  # type: ignore[attr-defined]
                    model_id=model.model_id,
                    audio_bytes=audio_bytes,
                    filename=f"audio.{format_ext}",
                )

            # Insert Transcript
            tx = Transcript(
                id=uuid4(),
                user_id=user_id,
                recording_id=recording_id,
                text=text,
                language=lang,
                provider=model.provider,
                model_id=model.model_id,
            )
            await self._tx_repo.create(tx)

            rec.status = RecordingStatus.transcribed
            await self._s.flush()

            # Settle credits
            if uses_platform_key and reservation_id:
                await self._credit_svc.settle(reservation_id, estimated_credits)
            elif reservation_id:
                await self._credit_svc.release(reservation_id)

            # Clean up audio for free plan users
            if await self._is_free_plan(user_id):
                try:
                    await self._storage_svc.delete_file(rec.storage_path)
                except Exception:
                    pass
                rec.local_only = True
                rec.storage_path = None
                await self._s.flush()

            await self._timeline_svc.record_note_event(
                user_id=user_id,
                space_id=rec.space_id,
                event_type="transcription",
                ref_id=recording_id,
                summary=text[:60] if text else "Voice note transcribed",
            )

            return tx

        except Exception as err:
            if uses_platform_key and reservation_id:
                await self._credit_svc.release(reservation_id)
            rec.status = RecordingStatus.failed
            rec.error = str(err)
            await self._s.flush()
            raise err
