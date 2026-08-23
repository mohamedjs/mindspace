from datetime import date
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.models import Profile, User
from app.modules.credits.enums import LedgerReason
from app.modules.credits.models import CreditLedger
from app.modules.spaces.models import Space
from tests.factories import UserCtx, create_supabase_token


@pytest.mark.asyncio
async def test_register_creates_complete_account(app_client: AsyncClient, session: AsyncSession):
    payload = {
        "email": "newuser@example.com",
        "password": "securepassword123",
        "full_name": "New User",
    }
    resp = await app_client.post("/auth/sign-up", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "newuser@example.com"
    assert data["user"]["user_metadata"]["full_name"] == "New User"

    user_id = UUID(data["user"]["id"])

    # 1. Profile exists with 100 credits and free_refill_at = today
    profile = await session.get(Profile, user_id)
    assert profile is not None
    assert profile.credits_balance == 100
    assert profile.credits_reserved == 0
    assert profile.free_refill_at == date.today()
    assert profile.display_name == "New User"

    # 2. Exactly one signup_grant ledger entry exists with delta=100
    stmt = select(CreditLedger).where(CreditLedger.user_id == user_id)
    ledgers = (await session.scalars(stmt)).all()
    assert len(ledgers) == 1
    assert ledgers[0].delta == 100
    assert ledgers[0].balance_after == 100
    assert ledgers[0].reason == LedgerReason.signup_grant

    # 3. Default space exists ("My MindSpace", "💡")
    stmt = select(Space).where(Space.user_id == user_id)
    spaces = (await session.scalars(stmt)).all()
    assert len(spaces) == 1
    assert spaces[0].name == "My MindSpace"
    assert spaces[0].emoji == "💡"


@pytest.mark.asyncio
async def test_register_duplicate_email_fails(app_client: AsyncClient, alice: UserCtx):
    payload = {
        "email": "alice@example.com",
        "password": "newpassword123",
    }
    resp = await app_client.post("/auth/sign-up", json=payload)
    assert resp.status_code == 409
    body = resp.json()
    assert body["error"] == "email_taken"


@pytest.mark.asyncio
async def test_sign_in_success_and_failure(app_client: AsyncClient, alice: UserCtx):
    # Valid sign-in
    resp = await app_client.post(
        "/auth/sign-in",
        json={"email": "alice@example.com", "password": "password123"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()

    # Wrong password
    resp = await app_client.post(
        "/auth/sign-in",
        json={"email": "alice@example.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"] == "invalid_credentials"

    # Non-existent user
    resp = await app_client.post(
        "/auth/sign-in",
        json={"email": "nonexistent@example.com", "password": "any"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"] == "invalid_credentials"


@pytest.mark.asyncio
async def test_refresh_token_rotation(app_client: AsyncClient, session: AsyncSession):
    reg = await app_client.post(
        "/auth/sign-up",
        json={"email": "refresh_test@example.com", "password": "password123"},
    )
    refresh_tok_1 = reg.json()["refresh_token"]

    # Rotate
    ref_resp = await app_client.post("/auth/refresh", json={"refresh_token": refresh_tok_1})
    assert ref_resp.status_code == 200
    refresh_tok_2 = ref_resp.json()["refresh_token"]
    assert refresh_tok_1 != refresh_tok_2

    # Reusing old token fails
    reused = await app_client.post("/auth/refresh", json={"refresh_token": refresh_tok_1})
    assert reused.status_code == 401
    assert reused.json()["error"] == "invalid_token"


@pytest.mark.asyncio
async def test_dual_secret_jwt_acceptance(app_client: AsyncClient, alice: UserCtx, monkeypatch):
    compat_secret = "test-supabase-secret-12345"
    token = create_supabase_token(alice.id, alice.user.email or "alice@example.com", compat_secret)

    # 1. With SUPABASE_JWT_SECRET set -> succeeds
    monkeypatch.setattr(settings, "supabase_jwt_secret", compat_secret)
    resp = await app_client.get("/auth/session", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["user"]["id"] == str(alice.id)

    # 2. With SUPABASE_JWT_SECRET unset -> 401
    monkeypatch.setattr(settings, "supabase_jwt_secret", None)
    resp2 = await app_client.get("/auth/session", headers={"Authorization": f"Bearer {token}"})
    assert resp2.status_code == 401
    assert resp2.json()["error"] == "unauthorized"


@pytest.mark.asyncio
async def test_account_profile_and_deletion_cascade(
    app_client: AsyncClient,
    alice: UserCtx,
    session: AsyncSession,
):
    headers = alice.headers

    # Get profile
    p_resp = await app_client.get("/account/profile", headers=headers)
    assert p_resp.status_code == 200
    assert p_resp.json()["display_name"] == "Alice"
    assert p_resp.json()["email"] == "alice@example.com"

    # Update display name
    patch_resp = await app_client.patch(
        "/account/profile",
        json={"display_name": "Alice Wonderland"},
        headers=headers,
    )
    assert patch_resp.status_code == 204

    # Verify update
    p_resp2 = await app_client.get("/account/profile", headers=headers)
    assert p_resp2.json()["display_name"] == "Alice Wonderland"

    # Delete account
    del_resp = await app_client.delete("/account", headers=headers)
    assert del_resp.status_code == 204

    # Verify user and related rows are gone
    assert await session.get(User, alice.id) is None
    assert await session.get(Profile, alice.id) is None
    stmt = select(Space).where(Space.user_id == alice.id)
    assert (await session.scalars(stmt)).all() == []
