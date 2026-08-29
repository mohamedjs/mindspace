import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import Profile
from app.modules.billing.enums import SubscriptionStatus
from app.modules.billing.models import Payment, Subscription
from app.modules.credits.enums import LedgerReason
from app.modules.credits.models import CreditLedger
from tests.factories import UserCtx


@pytest.mark.asyncio
async def test_billing_plans_list(app_client: AsyncClient):
    resp = await app_client.get("/billing/plans")
    assert resp.status_code == 200
    plans = resp.json()
    assert len(plans) >= 3
    plan_ids = [p["id"] for p in plans]
    assert "pro" in plan_ids


@pytest.mark.asyncio
async def test_buy_package_flow(
    as_alice: AsyncClient,
    alice: UserCtx,
    session: AsyncSession,
):
    # Initial balance = 1000
    resp = await as_alice.post(
        "/billing/packages/buy",
        json={
            "package_id": "starter_50",
            "channel": "test_pay",
            "receipt": "mock_receipt_123",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "verified"
    assert data["credits_granted"] == 500

    # Verify profile balance updated (1000 + 500 = 1500)
    p = await session.get(Profile, alice.id, populate_existing=True)
    assert p.credits_balance == 1500

    # Verify payment recorded
    pay_stmt = select(Payment).where(Payment.user_id == alice.id)
    pay = await session.scalar(pay_stmt)
    assert pay is not None
    assert pay.amount_egp == 50

    # Verify credit ledger entry
    ledger_stmt = select(CreditLedger).where(
        CreditLedger.user_id == alice.id, CreditLedger.reason == LedgerReason.purchase
    )
    ledger = await session.scalar(ledger_stmt)
    assert ledger is not None
    assert ledger.delta == 500
    assert ledger.balance_after == 1500


@pytest.mark.asyncio
async def test_subscribe_start_and_confirm_flow(
    as_alice: AsyncClient,
    alice: UserCtx,
    session: AsyncSession,
):
    # 1. Start subscription
    start_resp = await as_alice.post(
        "/billing/subscribe/start",
        json={"plan_id": "pro", "channel": "test_pay"},
    )
    assert start_resp.status_code == 200, start_resp.text
    start_data = start_resp.json()
    sub_id = start_data["subscription_id"]
    assert start_data["free"] is False
    assert start_data["intent"]["amount_egp"] == 300

    # Verify subscription created as pending
    sub = await session.get(Subscription, sub_id, populate_existing=True)
    assert sub.status == SubscriptionStatus.pending

    # 2. Confirm subscription
    confirm_resp = await as_alice.post(
        "/billing/subscribe/confirm",
        json={"subscription_id": sub_id, "receipt": "test_receipt_sub_1"},
    )
    assert confirm_resp.status_code == 200, confirm_resp.text
    confirm_data = confirm_resp.json()
    assert confirm_data["status"] == "active"
    assert confirm_data["credits_granted"] == 4500

    # Verify subscription is active
    sub_fresh = await session.get(Subscription, sub_id, populate_existing=True)
    assert sub_fresh.status == SubscriptionStatus.active

    # Verify balance updated
    p = await session.get(Profile, alice.id, populate_existing=True)
    assert p.credits_balance == 5500

    # 3. Confirming again is idempotent
    confirm_again = await as_alice.post(
        "/billing/subscribe/confirm",
        json={"subscription_id": sub_id, "receipt": "test_receipt_sub_1"},
    )
    assert confirm_again.status_code == 200
    assert confirm_again.json()["already_active"] is True
    assert confirm_again.json()["credits_granted"] == 0
