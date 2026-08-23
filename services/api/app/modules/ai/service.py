import math
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, NotFoundError
from app.core.models import Profile
from app.modules.ai.enums import AiActionKind, AiActionStatus, ModelKind, ProviderId
from app.modules.ai.extraction import (
    parse_extraction_json,
    parse_write_note_json,
)
from app.modules.ai.layout import (
    Rect,
    color_for_note,
    layout_new_notes,
    place_child,
)
from app.modules.ai.models import AiAction, AiActionItem, AiModel
from app.modules.ai.prompts import (
    EXTRACT_THOUGHTS_SYSTEM,
    EXTRACT_THOUGHTS_VERSION,
    WRITE_NOTE_SYSTEM,
    WRITE_NOTE_VERSION,
    build_extract_user_prompt,
    build_write_note_prompt,
)
from app.modules.ai.providers.factory import get_chat_provider
from app.modules.ai.repository import AiActionRepository, AiModelRepository
from app.modules.byok.service import ByokService
from app.modules.credits.service import CreditService
from app.modules.notes.models import Relationship, StickyNote
from app.modules.notes.repository import NoteRepository, RelationshipRepository
from app.modules.notes.service import NoteService
from app.modules.recordings.models import Transcript
from app.modules.spaces.service import SpaceService
from app.modules.timeline.service import TimelineService

BASE_EXTRACT_CREDITS = 8
BASE_WRITE_CREDITS = 4
USD_PER_CREDIT = Decimal("0.001")  # 10 credits = 1 EGP ~= 0.01 USD


class AiService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._model_repo = AiModelRepository(session)
        self._action_repo = AiActionRepository(session)
        self._byok_svc = ByokService(session)
        self._credit_svc = CreditService(session)
        self._space_svc = SpaceService(session)
        self._note_svc = NoteService(session)
        self._note_repo = NoteRepository(session)
        self._rel_repo = RelationshipRepository(session)
        self._timeline_svc = TimelineService(session)

    async def list_models(self, kind: ModelKind | None = None) -> list[AiModel]:
        return list(await self._model_repo.list_models(kind=kind))

    async def resolve_chat_model(self, user_id: UUID) -> AiModel:
        profile = await self._s.get(Profile, user_id)
        if profile and profile.chat_model_id:
            model = await self._model_repo.get_by_id(profile.chat_model_id)
            if model and model.enabled:
                return model

        default_model = await self._model_repo.get_default(ModelKind.chat)
        if default_model is None:
            raise AppError("no_default_model", "No default chat model configured", 500)
        return default_model

    async def resolve_api_key(
        self,
        user_id: UUID,
        model: AiModel,
    ) -> tuple[str, str | None, bool]:
        """Returns (api_key, base_url, uses_platform_key)."""
        # 1. Check user BYOK key first
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

        # 2. Check platform API keys
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
            # Fall back to openrouter key if configured
            if settings.platform_openrouter_key:
                return settings.platform_openrouter_key, None, True
            raise AppError(
                "missing_platform_key",
                f"No API key configured for provider {model.provider.value}",
                500,
            )

        return platform_key, None, True

    async def extract_thoughts(
        self,
        *,
        user_id: UUID,
        space_id: UUID,
        transcript_id: UUID,
        parent_note_id: UUID | None = None,
    ) -> tuple[AiAction, list[AiActionItem]]:
        # 1. Verify space & transcript ownership
        await self._space_svc.get_owned(space_id, user_id)
        transcript = await self._s.get(Transcript, transcript_id)
        if transcript is None or transcript.user_id != user_id:
            raise NotFoundError("transcript_not_found", "Transcript not found")

        # 2. Resolve model & keys
        model = await self.resolve_chat_model(user_id)
        api_key, base_url, uses_platform_key = await self.resolve_api_key(user_id, model)

        # 3. Credit Reservation
        reservation_id: UUID | None = None
        estimated_credits = math.ceil(BASE_EXTRACT_CREDITS * float(model.credit_multiplier))
        if uses_platform_key:
            reservation_id = await self._credit_svc.reserve(user_id, estimated_credits)

        try:
            # 4. Prepare Board Context & Clock
            existing_notes = list(await self._note_repo.list_by_space(space_id, user_id=user_id))
            focus_note = None
            if parent_note_id:
                focus_note_obj = await self._note_repo.get_owned(parent_note_id, user_id=user_id)
                if focus_note_obj:
                    focus_note = {
                        "id": str(focus_note_obj.id),
                        "title": focus_note_obj.title,
                        "content": focus_note_obj.content,
                        "type": focus_note_obj.type.value,
                    }

            profile = await self._s.get(Profile, user_id)
            tz = profile.timezone if profile else "Africa/Cairo"
            now = datetime.now(UTC)
            clock = {
                "today": now.strftime("%Y-%m-%d"),
                "weekday": now.strftime("%A"),
                "timezone": tz,
            }

            user_prompt = build_extract_user_prompt(
                transcript.text,
                existing_notes=[
                    {
                        "id": str(n.id),
                        "title": n.title,
                        "content": n.content,
                        "type": n.type.value,
                    }
                    for n in existing_notes
                ],
                focus_note=focus_note,
                clock=clock,
            )

            # 5. Call Provider
            provider = get_chat_provider(model.provider, api_key, base_url)
            completion = await provider.chat(
                model_id=model.model_id,
                system_prompt=EXTRACT_THOUGHTS_SYSTEM,
                user_prompt=user_prompt,
                json_mode=True,
            )

            # 6. Parse Extraction
            extracted = parse_extraction_json(completion.text)

            # 7. Settle Credits
            raw_cost = completion.raw_cost_usd
            if raw_cost is None:
                in_cost = (Decimal(completion.input_tokens) / 1_000_000) * (
                    model.input_price_m or Decimal(0)
                )
                out_cost = (Decimal(completion.output_tokens) / 1_000_000) * (
                    model.output_price_m or Decimal(0)
                )
                raw_cost = in_cost + out_cost

            actual_credits = 0
            if uses_platform_key:
                if raw_cost > 0:
                    calculated = math.ceil(
                        float(raw_cost / USD_PER_CREDIT) * float(model.credit_multiplier)
                    )
                    actual_credits = max(1, calculated)
                else:
                    actual_credits = estimated_credits

                if reservation_id:
                    await self._credit_svc.settle(reservation_id, actual_credits)
            elif reservation_id:
                await self._credit_svc.release(reservation_id)

            # 8. Layout & Create Notes and Relations
            created_notes, items = await self._apply_extracted_results(
                user_id=user_id,
                space_id=space_id,
                transcript=transcript,
                extracted=extracted,
                existing_notes=existing_notes,
                parent_note_id=parent_note_id,
            )

            # 9. Record AiAction
            action = AiAction(
                user_id=user_id,
                space_id=space_id,
                kind=AiActionKind.extract_thoughts,
                status=AiActionStatus.accepted,
                recording_id=transcript.recording_id,
                transcript_id=transcript.id,
                provider=model.provider,
                model_id=model.model_id,
                prompt_version=EXTRACT_THOUGHTS_VERSION,
                billed_to="credits" if uses_platform_key else "byok",
                credits_charged=actual_credits,
                input_tokens=completion.input_tokens,
                output_tokens=completion.output_tokens,
                raw_cost_usd=raw_cost,
                raw_response={"text": completion.text},
                resolved_at=datetime.now(UTC),
            )
            await self._action_repo.create_action(action, items)

            # Link ai_action_id to created notes
            for n in created_notes:
                n.ai_action_id = action.id
            await self._s.flush()

            # Touch space
            await self._space_svc.touch(space_id)

            return action, items

        except Exception as err:
            if reservation_id and uses_platform_key:
                await self._credit_svc.release(reservation_id)
            raise err

    async def _apply_extracted_results(
        self,
        *,
        user_id: UUID,
        space_id: UUID,
        transcript: Transcript,
        extracted: Any,
        existing_notes: list[StickyNote],
        parent_note_id: UUID | None,
    ) -> tuple[list[StickyNote], list[AiActionItem]]:
        notes_to_create = extracted.notes[:8]  # Hard cap 8 notes
        if not notes_to_create:
            return [], []

        # Identify top-level vs child notes
        existing_rects = [
            Rect(x=n.x, y=n.y, width=n.width, height=n.height)
            for n in existing_notes
            if n.parent_id is None
        ]

        top_level_candidates = [
            n for n in notes_to_create if not n.parent_client_key and not parent_note_id
        ]
        placed_top_level_rects = layout_new_notes(len(top_level_candidates), existing_rects)

        key_to_note_map: dict[str, StickyNote] = {}
        created_notes: list[StickyNote] = []
        items: list[AiActionItem] = []
        sort_order = 0

        top_idx = 0
        occupied_rects = list(existing_rects) + list(placed_top_level_rects)

        for n in notes_to_create:
            target_parent_id: UUID | None = None

            # Resolve parent_id
            if parent_note_id:
                target_parent_id = parent_note_id
            elif n.parent_client_key:
                if n.parent_client_key in key_to_note_map:
                    target_parent_id = key_to_note_map[n.parent_client_key].id
                else:
                    try:
                        existing_p_id = UUID(n.parent_client_key)
                        if any(ex.id == existing_p_id for ex in existing_notes):
                            target_parent_id = existing_p_id
                    except (ValueError, TypeError):
                        pass

            # Calculate Rect
            if target_parent_id:
                # Find parent rect
                parent_rect = next(
                    (
                        Rect(x=ex.x, y=ex.y, width=ex.width, height=ex.height)
                        for ex in existing_notes
                        if ex.id == target_parent_id
                    ),
                    None,
                )
                if not parent_rect and n.parent_client_key in key_to_note_map:
                    pn = key_to_note_map[n.parent_client_key]
                    parent_rect = Rect(x=pn.x, y=pn.y, width=pn.width, height=pn.height)

                if parent_rect:
                    child_rect = place_child(parent_rect, len(created_notes), occupied_rects)
                    x, y, w, h = child_rect.x, child_rect.y, child_rect.width, child_rect.height
                else:
                    r = layout_new_notes(1, occupied_rects)[0]
                    x, y, w, h = r.x, r.y, r.width, r.height
            else:
                r = placed_top_level_rects[top_idx]
                top_idx += 1
                x, y, w, h = r.x, r.y, r.width, r.height

            note_id = uuid4()
            note = StickyNote(
                id=note_id,
                user_id=user_id,
                space_id=space_id,
                title=n.title,
                content=n.content,
                type=n.type,
                color=color_for_note(n.type, n.color),
                x=x,
                y=y,
                width=w,
                height=h,
                parent_id=target_parent_id,
                source_type=__import__(
                    "app.modules.notes.enums", fromlist=["SourceType"]
                ).SourceType.ai,
                recording_id=transcript.recording_id,
                transcript_id=transcript.id,
                span_start=n.span_start,
                span_end=n.span_end,
                due_at=n.due_at,
            )
            self._s.add(note)
            key_to_note_map[n.client_key] = note
            created_notes.append(note)

            # AiActionItem for note creation
            item = AiActionItem(
                id=uuid4(),
                user_id=user_id,
                operation="create_note",
                target_type="sticky_note",
                target_id=note_id,
                forward_patch={
                    "id": str(note_id),
                    "title": n.title,
                    "content": n.content,
                    "type": n.type.value,
                },
                inverse_patch={"id": str(note_id), "operation": "delete_note"},
                accepted=True,
                applied_at=datetime.now(UTC),
                sort_order=sort_order,
            )
            items.append(item)
            sort_order += 1

        # Emit relationships
        for rel in extracted.relations:
            from_note = key_to_note_map.get(rel.from_key)
            to_note = key_to_note_map.get(rel.to_key)
            if from_note and to_note and from_note.id != to_note.id:
                r = Relationship(
                    id=uuid4(),
                    user_id=user_id,
                    space_id=space_id,
                    from_note_id=from_note.id,
                    to_note_id=to_note.id,
                    type=rel.type,
                    created_by="ai",
                )
                self._s.add(r)
                rel_item = AiActionItem(
                    id=uuid4(),
                    user_id=user_id,
                    operation="create_relationship",
                    target_type="relationship",
                    target_id=r.id,
                    forward_patch={
                        "from_id": str(from_note.id),
                        "to_id": str(to_note.id),
                        "type": rel.type.value,
                    },
                    inverse_patch={"id": str(r.id), "operation": "delete_relationship"},
                    accepted=True,
                    applied_at=datetime.now(UTC),
                    sort_order=sort_order,
                )
                items.append(rel_item)
                sort_order += 1

        await self._s.flush()

        # Update note count & timeline
        await self._space_svc.adjust_note_count(space_id, delta=len(created_notes))
        await self._timeline_svc.record_note_event(
            user_id=user_id,
            space_id=space_id,
            event_type="ai_extract",
            ref_id=transcript.id,
            summary=f"Extracted {len(created_notes)} thoughts from recording",
        )

        return created_notes, items

    async def write_note(
        self,
        *,
        user_id: UUID,
        space_id: UUID,
        note_id: UUID,
        transcript_id: UUID,
    ) -> tuple[AiAction, list[AiActionItem]]:
        await self._space_svc.get_owned(space_id, user_id)
        note = await self._note_repo.get_owned(note_id, user_id=user_id)
        if note is None:
            raise NotFoundError("note_not_found", "Note not found")

        transcript = await self._s.get(Transcript, transcript_id)
        if transcript is None or transcript.user_id != user_id:
            raise NotFoundError("transcript_not_found", "Transcript not found")

        model = await self.resolve_chat_model(user_id)
        api_key, base_url, uses_platform_key = await self.resolve_api_key(user_id, model)

        reservation_id: UUID | None = None
        estimated_credits = math.ceil(BASE_WRITE_CREDITS * float(model.credit_multiplier))
        if uses_platform_key:
            reservation_id = await self._credit_svc.reserve(user_id, estimated_credits)

        try:
            profile = await self._s.get(Profile, user_id)
            tz = profile.timezone if profile else "Africa/Cairo"
            now = datetime.now(UTC)
            clock = {
                "today": now.strftime("%Y-%m-%d"),
                "weekday": now.strftime("%A"),
                "timezone": tz,
            }

            user_prompt = build_write_note_prompt(
                transcript.text,
                note={"title": note.title, "content": note.content},
                clock=clock,
            )

            provider = get_chat_provider(model.provider, api_key, base_url)
            completion = await provider.chat(
                model_id=model.model_id,
                system_prompt=WRITE_NOTE_SYSTEM,
                user_prompt=user_prompt,
                json_mode=True,
            )

            written = parse_write_note_json(completion.text)

            # Settle credits
            raw_cost = completion.raw_cost_usd
            actual_credits = 0
            if uses_platform_key:
                actual_credits = estimated_credits
                if reservation_id:
                    await self._credit_svc.settle(reservation_id, actual_credits)
            elif reservation_id:
                await self._credit_svc.release(reservation_id)

            # Save previous state for inverse patch
            prev_state = {
                "title": note.title,
                "content": note.content,
                "due_at": note.due_at.isoformat() if note.due_at else None,
            }

            # Update note
            if written.title:
                note.title = written.title
            if written.content:
                if note.content and note.content.strip():
                    note.content = f"{note.content}\n\n{written.content}"
                else:
                    note.content = written.content
            if written.due_at:
                note.due_at = written.due_at
            note.updated_at = datetime.now(UTC)
            await self._s.flush()

            # Record AiAction & Item
            action_item = AiActionItem(
                id=uuid4(),
                user_id=user_id,
                operation="update_note",
                target_type="sticky_note",
                target_id=note_id,
                forward_patch={
                    "title": note.title,
                    "content": note.content,
                    "due_at": note.due_at.isoformat() if note.due_at else None,
                },
                inverse_patch=prev_state,
                accepted=True,
                applied_at=datetime.now(UTC),
                sort_order=0,
            )

            action = AiAction(
                user_id=user_id,
                space_id=space_id,
                kind=AiActionKind.extract_thoughts,
                status=AiActionStatus.accepted,
                recording_id=transcript.recording_id,
                transcript_id=transcript.id,
                provider=model.provider,
                model_id=model.model_id,
                prompt_version=WRITE_NOTE_VERSION,
                billed_to="credits" if uses_platform_key else "byok",
                credits_charged=actual_credits,
                input_tokens=completion.input_tokens,
                output_tokens=completion.output_tokens,
                raw_cost_usd=raw_cost,
                raw_response={"text": completion.text},
                resolved_at=datetime.now(UTC),
            )
            await self._action_repo.create_action(action, [action_item])
            await self._timeline_svc.record_note_event(
                user_id=user_id,
                space_id=space_id,
                event_type="ai_write_note",
                ref_id=note_id,
                summary=note.title or (note.content[:60] if note.content else ""),
            )

            return action, [action_item]

        except Exception as err:
            if reservation_id and uses_platform_key:
                await self._credit_svc.release(reservation_id)
            raise err

    async def undo_action(self, action_id: UUID, *, user_id: UUID) -> None:
        res = await self._action_repo.get_owned(action_id, user_id=user_id)
        if res is None:
            raise NotFoundError("action_not_found", "AI Action not found")

        action, items = res
        if action.status == AiActionStatus.undone:
            return

        for item in reversed(items):
            if item.operation == "create_note" and item.target_id:
                # Use _soft_delete_note to delete note + promote children + update note_count
                await self._note_svc._soft_delete_note(item.target_id, user_id=user_id)
            elif item.operation == "update_note" and item.target_id:
                prev = item.inverse_patch
                note = await self._note_repo.get_owned(item.target_id, user_id=user_id)
                if note:
                    note.title = prev.get("title")
                    note.content = prev.get("content", "")
                    note.updated_at = datetime.now(UTC)
                    await self._s.flush()

        await self._action_repo.update_action_status(action_id, AiActionStatus.undone)
