from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.enums import SubscriptionStatus
from app.modules.billing.models import Payment, Subscription, SubscriptionPlan


class PlanRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_enabled(self) -> Sequence[SubscriptionPlan]:
        stmt = (
            select(SubscriptionPlan)
            .where(SubscriptionPlan.enabled.is_(True))
            .order_by(SubscriptionPlan.sort_order.asc())
        )
        return (await self._s.scalars(stmt)).all()

    async def get_by_id(self, plan_id: str) -> SubscriptionPlan | None:
        return await self._s.get(SubscriptionPlan, plan_id)


class SubscriptionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_active_for_user(self, user_id: UUID) -> Subscription | None:
        stmt = (
            select(Subscription)
            .where(
                Subscription.user_id == user_id,
                Subscription.status == SubscriptionStatus.active,
            )
            .order_by(Subscription.created_at.desc())
        )
        return await self._s.scalar(stmt)

    async def get_owned(self, subscription_id: UUID, *, user_id: UUID) -> Subscription | None:
        stmt = select(Subscription).where(
            Subscription.id == subscription_id,
            Subscription.user_id == user_id,
        )
        return await self._s.scalar(stmt)

    async def create(self, sub: Subscription) -> Subscription:
        self._s.add(sub)
        await self._s.flush()
        return sub

    async def update_status(
        self,
        subscription_id: UUID,
        status: SubscriptionStatus,
        **extra,
    ) -> None:
        stmt = (
            update(Subscription)
            .where(Subscription.id == subscription_id)
            .values(status=status, **extra)
        )
        await self._s.execute(stmt)


class PaymentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(self, payment: Payment) -> Payment:
        self._s.add(payment)
        await self._s.flush()
        return payment

    async def get_by_channel_and_ref(self, channel: str, external_ref: str) -> Payment | None:
        stmt = select(Payment).where(
            Payment.channel == channel,
            Payment.external_ref == external_ref,
        )
        return await self._s.scalar(stmt)
