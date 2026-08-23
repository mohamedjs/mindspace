import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.enums import ProviderId
from app.modules.byok.crypto import decrypt_api_key, encrypt_api_key, generate_key_hint
from app.modules.byok.service import ByokService
from tests.factories import UserCtx


def test_byok_crypto_roundtrip():
    secret = "sk-ant-api03-abcdef1234567890abcdef1234567890"
    encrypted = encrypt_api_key(secret)
    assert encrypted != secret.encode()
    decrypted = decrypt_api_key(encrypted)
    assert decrypted == secret

    hint = generate_key_hint(secret)
    assert hint == "...7890"


@pytest.mark.asyncio
async def test_byok_endpoints_and_decryption(
    as_alice: AsyncClient,
    alice: UserCtx,
    session: AsyncSession,
):
    # 1. Save BYOK key
    payload = {
        "provider": "anthropic",
        "api_key": "sk-ant-test-secret-1234",
        "label": "My Anthropic Key",
    }
    resp = await as_alice.post("/byok/keys", json=payload)
    assert resp.status_code == 201
    key_data = resp.json()
    assert key_data["provider"] == "anthropic"
    assert key_data["key_hint"] == "...1234"
    assert key_data["label"] == "My Anthropic Key"
    assert "api_key" not in key_data
    assert "encrypted_key" not in key_data
    key_id = key_data["id"]

    # 2. List keys
    list_resp = await as_alice.get("/byok/keys")
    assert list_resp.status_code == 200
    keys = list_resp.json()
    assert len(keys) == 1
    assert keys[0]["id"] == key_id

    # 3. Decrypt via service
    svc = ByokService(session)
    decrypted_key, base_url, _ = await svc.get_decrypted_key(alice.id, ProviderId.anthropic)
    assert decrypted_key == "sk-ant-test-secret-1234"

    # 4. Delete key
    del_resp = await as_alice.delete(f"/byok/keys/{key_id}")
    assert del_resp.status_code == 204

    # 5. Verify deleted
    list_resp2 = await as_alice.get("/byok/keys")
    assert len(list_resp2.json()) == 0
