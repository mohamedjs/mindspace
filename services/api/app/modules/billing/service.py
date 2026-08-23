from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError
from app.modules.billing.enums import PaymentChannel, SubscriptionStatus
from app.modules.billing.models import Payment, Subscription, SubscriptionPlan
from app.modules.billing.repository import (
    PaymentRepository,
    PlanRepository,
    SubscriptionRepository,
)
from app.modules.billing.schemas import (
    PaymentOut,
    SubscribeConfirmOut,
    SubscribeStartOut,
)
from app.modules.billing.verifiers import verify_payment
from app.modules.credits.enums import LedgerReason
from app.modules.credits.models import CreditPackage
from app.modules.credits.service import CreditService


class BillingService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._plan_repo = PlanRepository(session)
        self._sub_repo = SubscriptionRepository(session)
        self._pay_repo = PaymentRepository(session)
        self._credit_svc = CreditService(session)

    async def list_plans(self) -> list[SubscriptionPlan]:
        return list(await self._plan_repo.list_enabled())

    async def get_active_subscription(self, user_id: UUID) -> Subscription | None:
        return await self._sub_repo.get_active_for_user(user_id)

    async def start_subscription(
        self,
        *,
        user_id: UUID,
        plan_id: str,
        channel: PaymentChannel | None = None,
    ) -> SubscribeStartOut:
        plan = await self._plan_repo.get_by_id(plan_id)
        if plan is None or not plan.enabled:
            raise NotFoundError("plan_not_found", "Subscription plan not found or disabled")

        now = datetime.now(UTC)

        # Free plan (price_egp == 0)
        if plan.price_egp == 0:
            sub = Subscription(
                id=uuid4(),
                user_id=user_id,
                plan_id=plan.id,
                status=SubscriptionStatus.active,
                channel=channel or PaymentChannel.test_pay,
                current_period_start=now,
                current_period_end=now + timedelta(days=36500),  # 100 years
            )
            await self._sub_repo.create(sub)
            return SubscribeStartOut(subscription_id=sub.id, free=True)

        if channel is None:
            raise AppError("missing_channel", "Payment channel is required for paid plans", 400)

        # Create pending subscription
        sub = Subscription(
            id=uuid4(),
            user_id=user_id,
            plan_id=plan.id,
            status=SubscriptionStatus.pending,
            channel=channel,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        await self._sub_repo.create(sub)

        return SubscribeStartOut(
            subscription_id=sub.id,
            free=False,
            intent={
                "amount_egp": plan.price_egp,
                "reference": str(sub.id),
                "channel": channel.value,
            },
        )

    async def confirm_subscription(
        self,
        *,
        user_id: UUID,
        subscription_id: UUID,
        receipt: str | None = None,
        external_ref: str | None = None,
    ) -> SubscribeConfirmOut:
        sub = await self._sub_repo.get_owned(subscription_id, user_id=user_id)
        if sub is None:
            raise NotFoundError("subscription_not_found", "Subscription not found")

        if sub.status == SubscriptionStatus.active:
            return SubscribeConfirmOut(
                subscription_id=sub.id,
                status=sub.status,
                credits_granted=0,
                already_active=True,
            )

        plan = await self._plan_repo.get_by_id(sub.plan_id)
        if plan is None:
            raise NotFoundError("plan_not_found", "Plan not found")

        # Verify payment
        verification = await verify_payment(
            channel=sub.channel,
            reference=str(sub.id),
            amount_egp=plan.price_egp,
            receipt=receipt,
            external_ref=external_ref,
        )
        if not verification.verified:
            raise AppError(
                "payment_not_verified", verification.reason or "Payment verification failed", 402
            )

        # Check existing payment idempotency
        existing_pay = await self._pay_repo.get_by_channel_and_ref(
            sub.channel.value, verification.external_ref
        )
        if existing_pay:
            return SubscribeConfirmOut(
                subscription_id=sub.id,
                status=SubscriptionStatus.active,
                credits_granted=0,
                already_active=True,
            )

        # Record payment
        now = datetime.now(UTC)
        payment = Payment(
            id=uuid4(),
            user_id=user_id,
            subscription_id=sub.id,
            channel=sub.channel,
            external_ref=verification.external_ref,
            amount_egp=plan.price_egp,
            status="verified",
            raw_receipt=verification.raw,
            verified_at=now,
        )
        await self._pay_repo.create(payment)

        # Activate subscription
        sub.status = SubscriptionStatus.active
        sub.current_period_start = now
        sub.current_period_end = now + timedelta(days=30)
        await self._s.flush()

        # Grant monthly credits if non-zero
        credits_granted = 0
        if plan.total_credits and plan.total_credits > 0:
            credits_granted = plan.total_credits
            await self._credit_svc.grant(
                user_id=user_id,
                amount=credits_granted,
                reason=LedgerReason.purchase,
                meta={"subscription_id": str(sub.id), "plan_id": plan.id},
            )

        return SubscribeConfirmOut(
            subscription_id=sub.id,
            status=sub.status,
            credits_granted=credits_granted,
            already_active=False,
        )

    async def buy_package(
        self,
        *,
        user_id: UUID,
        package_id: str,
        channel: PaymentChannel,
        receipt: str | None = None,
        external_ref: str | None = None,
    ) -> PaymentOut:
        pkg = await self._s.get(CreditPackage, package_id)
        if pkg is None:
            raise NotFoundError("package_not_found", "Credit package not found")

        ref = str(uuid4())
        verification = await verify_payment(
            channel=channel,
            reference=ref,
            amount_egp=pkg.price_egp,
            receipt=receipt,
            external_ref=external_ref,
        )
        if not verification.verified:
            raise AppError(
                "payment_not_verified", verification.reason or "Payment verification failed", 402
            )

        # Check existing payment idempotency
        existing_pay = await self._pay_repo.get_by_channel_and_ref(
            channel.value, verification.external_ref
        )
        if existing_pay:
            return PaymentOut(
                id=existing_pay.id,
                status=existing_pay.status,
                channel=channel,
                amount_egp=existing_pay.amount_egp,
                credits_granted=pkg.total_credits,
                created_at=existing_pay.created_at,
            )

        now = datetime.now(UTC)
        payment = Payment(
            id=uuid4(),
            user_id=user_id,
            channel=channel,
            external_ref=verification.external_ref,
            amount_egp=pkg.price_egp,
            status="verified",
            raw_receipt=verification.raw,
            verified_at=now,
        )
        await self._pay_repo.create(payment)

        # Grant credits
        await self._credit_svc.grant(
            user_id=user_id,
            amount=pkg.total_credits,
            reason=LedgerReason.purchase,
            package_id=pkg.id,
            payment_ref=verification.external_ref,
            meta={"package_id": pkg.id, "payment_id": str(payment.id)},
        )

        return PaymentOut(
            id=payment.id,
            status=payment.status,
            channel=channel,
            amount_egp=payment.amount_egp,
            credits_granted=pkg.total_credits,
            created_at=payment.created_at,
        )
