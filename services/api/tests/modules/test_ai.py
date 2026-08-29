import json
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.ai.enums import ProviderId
from app.modules.ai.providers.base import ProviderCompletion
from app.modules.notes.models import StickyNote
from app.modules.recordings.enums import RecordingStatus
from app.modules.recordings.models import Recording, Transcript
from tests.factories import UserCtx


@pytest.mark.asyncio
async def test_ai_models_endpoint(app_client: AsyncClient):
    resp = await app_client.get("/ai/models")
    assert resp.status_code == 200
    models = resp.json()
    assert len(models) >= 1
    assert any(m["model_id"] == "deepseek/deepseek-v4-flash" for m in models)


@pytest.mark.asyncio
async def test_extract_thoughts_and_undo_lifecycle(
    as_alice: AsyncClient,
    alice: UserCtx,
    session: AsyncSession,
    monkeypatch,
):
    space_id = alice.space.id

    # 1. Seed recording & transcript
    rec = Recording(
        id=uuid4(),
        user_id=alice.id,
        space_id=space_id,
        duration_ms=30000,
        status=RecordingStatus.transcribed,
    )
    session.add(rec)
    await session.flush()

    transcript = Transcript(
        id=uuid4(),
        user_id=alice.id,
        recording_id=rec.id,
        text="I want to build a voice app for developers. I should email Ahmed about the pricing.",
        provider=ProviderId.openrouter,
        model_id="google/gemini-2.5-flash",
    )
    session.add(transcript)
    await session.commit()

    # Mock provider response
    mock_json = json.dumps(
        {
            "notes": [
                {
                    "clientKey": "note_0",
                    "title": "Voice app for devs",
                    "content": "I want to build a voice app for developers.",
                    "type": "idea",
                    "parentClientKey": None,
                    "dueAt": None,
                    "spanStart": 0,
                    "spanEnd": 45,
                },
                {
                    "clientKey": "note_1",
                    "title": "Email Ahmed about pricing",
                    "content": "I should email Ahmed about the pricing.",
                    "type": "task",
                    "parentClientKey": None,
                    "dueAt": None,
                    "spanStart": 46,
                    "spanEnd": 85,
                },
            ],
            "relations": [],
        }
    )
    mock_completion = ProviderCompletion(text=mock_json, input_tokens=150, output_tokens=80)

    monkeypatch.setattr(settings, "platform_openrouter_key", "test-mock-key")

    with patch(
        "app.modules.ai.providers.openrouter.OpenRouterProvider.chat", new_callable=AsyncMock
    ) as mock_chat:
        mock_chat.return_value = mock_completion

        # 2. Call /spaces/{id}/ai/extract
        resp = await as_alice.post(
            f"/spaces/{space_id}/ai/extract",
            json={"transcript_id": str(transcript.id)},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["kind"] == "extract_thoughts"
        assert data["status"] == "accepted"
        assert len(data["items"]) == 2
        action_id = data["id"]

        # Verify notes were created in DB
        notes_stmt = select(StickyNote).where(
            StickyNote.space_id == space_id, StickyNote.deleted_at.is_(None)
        )
        live_notes = (await session.scalars(notes_stmt)).all()
        assert len(live_notes) == 2

        # 3. Undo AI action
        undo_resp = await as_alice.post(f"/ai/actions/{action_id}/undo")
        assert undo_resp.status_code == 204

        # Verify notes are soft deleted
        live_notes_after = (await session.scalars(notes_stmt)).all()
        assert len(live_notes_after) == 0


@pytest.mark.asyncio
async def test_write_note_lifecycle(
    as_alice: AsyncClient,
    alice: UserCtx,
    session: AsyncSession,
    monkeypatch,
):
    space_id = alice.space.id

    # Create note
    note = StickyNote(
        id=uuid4(),
        user_id=alice.id,
        space_id=space_id,
        title="Initial Title",
        content="Initial Content",
        type=__import__("app.modules.notes.enums", fromlist=["NoteType"]).NoteType.idea,
        x=0.0,
        y=0.0,
    )
    session.add(note)

    # Seed recording & transcript
    rec = Recording(
        id=uuid4(),
        user_id=alice.id,
        space_id=space_id,
        duration_ms=15000,
        status=RecordingStatus.transcribed,
    )
    session.add(rec)
    await session.flush()

    transcript = Transcript(
        id=uuid4(),
        user_id=alice.id,
        recording_id=rec.id,
        text="Also remember we need to buy more coffee tomorrow.",
        provider=ProviderId.openrouter,
        model_id="google/gemini-2.5-flash",
    )
    session.add(transcript)
    await session.commit()

    mock_json = json.dumps(
        {
            "title": "Coffee Supply",
            "content": "Buy more coffee tomorrow.",
            "dueAt": "2026-08-25T09:00:00+03:00",
        }
    )
    mock_completion = ProviderCompletion(text=mock_json, input_tokens=100, output_tokens=40)

    monkeypatch.setattr(settings, "platform_openrouter_key", "test-mock-key")

    with patch(
        "app.modules.ai.providers.openrouter.OpenRouterProvider.chat", new_callable=AsyncMock
    ) as mock_chat:
        mock_chat.return_value = mock_completion

        resp = await as_alice.post(
            f"/spaces/{space_id}/ai/note-write",
            json={"note_id": str(note.id), "transcript_id": str(transcript.id)},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["status"] == "accepted"

        # Verify note updated
        note_fresh = await session.get(StickyNote, note.id, populate_existing=True)
        assert note_fresh.title == "Coffee Supply"
        assert "Buy more coffee tomorrow" in note_fresh.content
