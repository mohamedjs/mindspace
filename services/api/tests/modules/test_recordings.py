from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.recordings.enums import RecordingStatus
from app.modules.recordings.models import Recording
from app.modules.storage.service import StorageService
from tests.factories import UserCtx


@pytest.mark.asyncio
async def test_recording_crud_and_transcription_flow(
    as_alice: AsyncClient,
    alice: UserCtx,
    session: AsyncSession,
    monkeypatch,
):
    space_id = alice.space.id

    # 1. Create recording entry
    create_resp = await as_alice.post(
        f"/spaces/{space_id}/recordings",
        json={
            "duration_ms": 25000,
            "local_only": False,
            "mime_type": "audio/m4a",
        },
    )
    assert create_resp.status_code == 201
    rec_data = create_resp.json()
    rec_id = rec_data["id"]
    assert rec_data["duration_ms"] == 25000

    # 2. Upload dummy audio bytes to storage
    storage_svc = StorageService()
    storage_path = f"recordings/{alice.id}/{space_id}/{rec_id}.m4a"
    dummy_audio = b"RIFF....dummy audio bytes"
    await storage_svc.upload_bytes(storage_path, dummy_audio)

    # Attach storage_path to recording in DB
    rec_obj = await session.get(Recording, rec_id)
    rec_obj.storage_path = storage_path
    await session.commit()

    # 3. List recordings
    list_resp = await as_alice.get(f"/spaces/{space_id}/recordings")
    assert list_resp.status_code == 200
    recs = list_resp.json()
    assert len(recs) == 1
    assert recs[0]["id"] == rec_id

    # 4. Transcribe recording with mocked provider
    monkeypatch.setattr(settings, "platform_openrouter_key", "test-mock-key")

    with patch(
        "app.modules.ai.providers.openrouter.OpenRouterProvider.transcribe_via_chat",
        new_callable=AsyncMock,
    ) as mock_tx:
        mock_tx.return_value = ("Here is the transcribed text from audio.", "en")

        tx_resp = await as_alice.post(
            f"/spaces/{space_id}/recordings/transcribe",
            json={"recording_id": rec_id},
        )
        assert tx_resp.status_code == 200, tx_resp.text
        tx_data = tx_resp.json()
        assert tx_data["text"] == "Here is the transcribed text from audio."
        assert tx_data["language"] == "en"

        # 5. Fetch transcript endpoint
        get_tx_resp = await as_alice.get(f"/recordings/{rec_id}/transcript")
        assert get_tx_resp.status_code == 200
        assert get_tx_resp.json()["text"] == "Here is the transcribed text from audio."

        # 6. Verify free plan user audio was cleaned up server-side
        rec_fresh = await session.get(Recording, rec_id, populate_existing=True)
        assert rec_fresh.status_code if hasattr(rec_fresh, "status_code") else True
        assert rec_fresh.status == RecordingStatus.transcribed
        assert rec_fresh.local_only is True
        assert rec_fresh.storage_path is None
