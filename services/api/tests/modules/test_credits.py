from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import InsufficientCreditsError
from app.core.models import Profile
from app.modules.credits.enums import LedgerReason
from app.modules.credits.jobs import expire_stale_reservations, process_monthly_refills
from app.modules.credits.models import CreditLedger, CreditReservation
from app.modules.credits.service import CreditService
from tests.factories import UserCtx


@pytest.mark.asyncio
async def test_credit_balance_and_packages_endpoint(
    as_alice: AsyncClient,
    alice: UserCtx,
):
    # Balance endpoint
    resp = await as_alice.get("/credits/balance")
    assert resp.status_code == 200
    data = resp.json()
    assert data["balance"] == 1000
    assert data["reserved"] == 0
    assert data["available"] == 1000

    # Packages endpoint (public)
    pkg_resp = await as_alice.get("/credits/packages")
    assert pkg_resp.status_code == 200
    pkgs = pkg_resp.json()
    assert len(pkgs) >= 4
    pkg_ids = [p["id"] for p in pkgs]
    assert "starter_50" in pkg_ids
    assert "regular_100" in pkg_ids


@pytest.mark.asyncio
async def test_reserve_settle_release_lifecycle(session: AsyncSession, alice: UserCtx):
    svc = CreditService(session)

    # 1. Reserve 300 credits
    res_id = await svc.reserve(alice.id, 300)
    bal, res = await svc.get_balance(alice.id)
    assert bal == 1000
    assert res == 300

    # 2. Settle with actual 250 credits
    charged = await svc.settle(res_id, 250)
    assert charged == 250
    bal2, res2 = await svc.get_balance(alice.id)
    assert bal2 == 750
    assert res2 == 0

    # 3. Reserve 200 and release
    res_id_2 = await svc.reserve(alice.id, 200)
    bal3, res3 = await svc.get_balance(alice.id)
    assert bal3 == 750
    assert res3 == 200

    await svc.release(res_id_2)
    bal4, res4 = await svc.get_balance(alice.id)
    assert bal4 == 750
    assert res4 == 0

    # 4. Over-reserve fails with InsufficientCreditsError
    with pytest.raises(InsufficientCreditsError):
        await svc.reserve(alice.id, 800)


@pytest.mark.asyncio
async def test_expire_stale_reservations_job(session: AsyncSession, alice: UserCtx):
    # Insert expired reservation
    stale_res = CreditReservation(
        user_id=alice.id,
        amount=400,
        status="held",
        expires_at=datetime.now(UTC) - timedelta(minutes=5),
    )
    session.add(stale_res)

    profile = await session.get(Profile, alice.id)
    profile.credits_reserved = 400
    await session.flush()

    # Run expiration job
    count = await expire_stale_reservations(session)
    assert count == 1

    # Verify profile reserved credits freed
    await session.refresh(profile)
    assert profile.credits_reserved == 0

    # Verify reservation status changed to expired
    await session.refresh(stale_res)
    assert stale_res.status == "expired"


@pytest.mark.asyncio
async def test_process_monthly_refills_job(session: AsyncSession, alice: UserCtx, bob: UserCtx):
    # Set Alice balance to 40 credits and due date to yesterday
    p_alice = await session.get(Profile, alice.id)
    p_alice.credits_balance = 40
    p_alice.free_refill_at = date.today() - timedelta(days=1)

    # Set Bob balance to 500 credits (>= 100) and due date to yesterday
    p_bob = await session.get(Profile, bob.id)
    p_bob.credits_balance = 500
    p_bob.free_refill_at = date.today() - timedelta(days=1)
    await session.flush()

    # Run monthly refill job
    topped_up = await process_monthly_refills(session)
    assert topped_up == 1  # Only Alice topped up

    # Verify Alice topped up to 100
    await session.refresh(p_alice)
    assert p_alice.credits_balance == 100
    assert p_alice.free_refill_at > date.today()

    # Verify Bob not changed but due date advanced
    await session.refresh(p_bob)
    assert p_bob.credits_balance == 500
    assert p_bob.free_refill_at > date.today()

    # Verify Alice received monthly_refill ledger entry of +60
    stmt = select(CreditLedger).where(
        CreditLedger.user_id == alice.id, CreditLedger.reason == LedgerReason.monthly_refill
    )
    entry = await session.scalar(stmt)
    assert entry is not None
    assert entry.delta == 60
    assert entry.balance_after == 100
