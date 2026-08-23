from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import InsufficientCreditsError, NotFoundError
from app.core.models import Profile
from app.modules.credits.enums import LedgerReason
from app.modules.credits.models import CreditLedger, CreditPackage
from app.modules.credits.repository import CreditRepository


class CreditService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._repo = CreditRepository(session)

    async def get_balance(self, user_id: UUID) -> tuple[int, int]:
        profile = await self._s.get(Profile, user_id)
        if profile is None:
            raise NotFoundError("profile_not_found", "Profile not found")
        return profile.credits_balance, profile.credits_reserved

    async def reserve(
        self,
        user_id: UUID,
        amount: int,
        ai_action_id: UUID | None = None,
    ) -> UUID:
        if amount <= 0:
            raise ValueError("Reservation amount must be positive")

        profile = await self._repo.get_profile_for_update(user_id)
        if profile is None:
            raise NotFoundError("profile_not_found", "Profile not found")

        available = profile.credits_balance - profile.credits_reserved
        if available < amount:
            raise InsufficientCreditsError(f"need {amount}, available {available}")

        # Reserve credits
        await self._repo.update_balance_and_reserved(user_id, reserved_delta=amount)
        res = await self._repo.insert_reservation(user_id, amount, ai_action_id=ai_action_id)
        return res.id

    async def settle(
        self,
        reservation_id: UUID,
        actual_amount: int,
        ai_action_id: UUID | None = None,
    ) -> int:
        res = await self._repo.get_reservation_for_update(reservation_id)
        if res is None or res.status != "held":
            return 0

        user_id = res.user_id
        reserved_amount = res.amount

        # Free the reserved amount and subtract actual balance
        profile = await self._repo.update_balance_and_reserved(
            user_id,
            balance_delta=-actual_amount,
            reserved_delta=-reserved_amount,
        )

        # Only insert ledger entry if actual_amount > 0
        if actual_amount > 0:
            await self._repo.insert_ledger_entry(
                user_id=user_id,
                delta=-actual_amount,
                balance_after=profile.credits_balance,
                reason=LedgerReason.usage,
                ai_action_id=ai_action_id or res.ai_action_id,
            )

        res.status = "settled"
        if ai_action_id:
            res.ai_action_id = ai_action_id
        await self._s.flush()
        return actual_amount

    async def release(self, reservation_id: UUID) -> None:
        res = await self._repo.get_reservation_for_update(reservation_id)
        if res is None or res.status != "held":
            return

        user_id = res.user_id
        reserved_amount = res.amount

        await self._repo.update_balance_and_reserved(user_id, reserved_delta=-reserved_amount)
        res.status = "released"
        await self._s.flush()

    async def grant(
        self,
        user_id: UUID,
        amount: int,
        reason: LedgerReason = LedgerReason.purchase,
        package_id: str | None = None,
        payment_ref: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> int:
        if amount <= 0:
            return 0

        profile = await self._repo.update_balance_and_reserved(user_id, balance_delta=amount)
        await self._repo.insert_ledger_entry(
            user_id=user_id,
            delta=amount,
            balance_after=profile.credits_balance,
            reason=reason,
            package_id=package_id,
            payment_ref=payment_ref,
            meta=meta,
        )
        return profile.credits_balance

    async def record_signup_grant(self, user_id: UUID, amount: int = 100) -> None:
        await self._repo.insert_ledger_entry(
            user_id=user_id,
            delta=amount,
            balance_after=amount,
            reason=LedgerReason.signup_grant,
        )

    async def list_ledger(
        self,
        user_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[CreditLedger]:
        return await self._repo.list_ledger_for_user(user_id, limit=limit, offset=offset)

    async def list_packages(self) -> Sequence[CreditPackage]:
        return await self._repo.list_enabled_packages()
