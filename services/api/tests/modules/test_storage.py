import pytest
from httpx import AsyncClient

from app.modules.storage.service import StorageService
from tests.factories import UserCtx


@pytest.mark.asyncio
async def test_storage_presigned_upload_and_operations(
    as_alice: AsyncClient,
    alice: UserCtx,
):
    space_id = alice.space.id

    # 1. Presigned upload URL endpoint
    resp = await as_alice.post(
        f"/spaces/{space_id}/recordings/presigned-upload",
        json={"filename": "test_voice.m4a", "content_type": "audio/m4a"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "upload_url" in data
    assert data["upload_url"].startswith("http")
    assert "storage_path" in data
    assert f"recordings/{alice.id}/{space_id}/" in data["storage_path"]

    # 2. Upload, download, delete via StorageService
    svc = StorageService()
    storage_path = data["storage_path"]
    dummy_bytes = b"RIFF....WAVEfmt test audio data"

    await svc.upload_bytes(storage_path, dummy_bytes, content_type="audio/m4a")

    downloaded = await svc.download_bytes(storage_path)
    assert downloaded == dummy_bytes

    download_url = await svc.generate_presigned_download_url(storage_path)
    assert download_url.startswith("http")

    await svc.delete_file(storage_path)
