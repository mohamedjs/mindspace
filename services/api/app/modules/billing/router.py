from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.models import User
from app.modules.auth.deps import current_user
from app.modules.billing.schemas import (
    BuyPackageRequest,
    PaymentOut,
    SubscribeConfirmOut,
    SubscribeConfirmRequest,
    SubscribeStartOut,
    SubscribeStartRequest,
    SubscriptionOut,
    SubscriptionPlanOut,
)
from app.modules.billing.service import BillingService

billing_router = APIRouter(prefix="/billing", tags=["billing"])


@billing_router.get("/plans", response_model=list[SubscriptionPlanOut])
async def list_plans(
    session: AsyncSession = Depends(get_session),
) -> list[SubscriptionPlanOut]:
    svc = BillingService(session)
    plans = await svc.list_plans()
    return [
        SubscriptionPlanOut(
            id=p.id,
            name=p.name,
            tagline=p.tagline,
            price_egp=p.price_egp,
            base_credits=p.base_credits,
            bonus_pct=p.bonus_pct,
            total_credits=p.total_credits,
            is_featured=p.is_featured,
            enabled=p.enabled,
            sort_order=p.sort_order,
            max_recording_minutes=p.max_recording_minutes,
            is_byok=p.is_byok,
            ai_enabled=p.ai_enabled,
        )
        for p in plans
    ]


@billing_router.get("/subscription", response_model=SubscriptionOut | None)
async def get_subscription(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> SubscriptionOut | None:
    svc = BillingService(session)
    sub = await svc.get_active_subscription(user.id)
    if sub is None:
        return None
    return SubscriptionOut(
        id=sub.id,
        plan_id=sub.plan_id,
        status=sub.status,
        channel=sub.channel,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        cancelled_at=sub.cancelled_at,
    )


@billing_router.post(
    "/subscribe/start",
    response_model=SubscribeStartOut,
    status_code=status.HTTP_200_OK,
)
async def start_subscription(
    body: SubscribeStartRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> SubscribeStartOut:
    svc = BillingService(session)
    return await svc.start_subscription(
        user_id=user.id,
        plan_id=body.plan_id,
        channel=body.channel,
    )


@billing_router.post(
    "/subscribe/confirm",
    response_model=SubscribeConfirmOut,
    status_code=status.HTTP_200_OK,
)
async def confirm_subscription(
    body: SubscribeConfirmRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> SubscribeConfirmOut:
    svc = BillingService(session)
    return await svc.confirm_subscription(
        user_id=user.id,
        subscription_id=body.subscription_id,
        receipt=body.receipt,
        external_ref=body.external_ref,
    )


@billing_router.post(
    "/packages/buy",
    response_model=PaymentOut,
    status_code=status.HTTP_200_OK,
)
async def buy_package(
    body: BuyPackageRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> PaymentOut:
    svc = BillingService(session)
    return await svc.buy_package(
        user_id=user.id,
        package_id=body.package_id,
        channel=body.channel,
        receipt=body.receipt,
        external_ref=body.external_ref,
    )
