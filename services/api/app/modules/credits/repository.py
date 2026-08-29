from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import Profile
from app.modules.credits.enums import LedgerReason
from app.modules.credits.models import CreditLedger, CreditPackage, CreditReservation


class CreditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_profile_for_update(self, user_id: UUID) -> Profile | None:
        stmt = select(Profile).where(Profile.id == user_id).with_for_update()
        return await self._s.scalar(stmt)

    async def update_balance_and_reserved(
        self,
        user_id: UUID,
        *,
        balance_delta: int = 0,
        reserved_delta: int = 0,
    ) -> Profile:
        profile = await self.get_profile_for_update(user_id)
        if profile is None:
            raise ValueError(f"Profile {user_id} not found")

        if balance_delta != 0:
            profile.credits_balance = profile.credits_balance + balance_delta
        if reserved_delta != 0:
            profile.credits_reserved = profile.credits_reserved + reserved_delta

        await self._s.flush()
        return profile

    async def set_balance(
        self,
        user_id: UUID,
        *,
        credits_balance: int,
        credits_reserved: int | None = None,
    ) -> Profile:
        profile = await self.get_profile_for_update(user_id)
        if profile is None:
            raise ValueError(f"Profile {user_id} not found")

        profile.credits_balance = credits_balance
        if credits_reserved is not None:
            profile.credits_reserved = credits_reserved

        await self._s.flush()
        return profile

    async def get_reservation_for_update(self, reservation_id: UUID) -> CreditReservation | None:
        stmt = (
            select(CreditReservation)
            .where(CreditReservation.id == reservation_id)
            .with_for_update()
        )
        return await self._s.scalar(stmt)

    async def insert_reservation(
        self,
        user_id: UUID,
        amount: int,
        ai_action_id: UUID | None = None,
    ) -> CreditReservation:
        res = CreditReservation(
            user_id=user_id,
            amount=amount,
            status="held",
            ai_action_id=ai_action_id,
        )
        self._s.add(res)
        await self._s.flush()
        return res

    async def insert_ledger_entry(
        self,
        user_id: UUID,
        delta: int,
        balance_after: int,
        reason: LedgerReason,
        ai_action_id: UUID | None = None,
        package_id: str | None = None,
        payment_ref: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> CreditLedger:
        entry = CreditLedger(
            user_id=user_id,
            delta=delta,
            balance_after=balance_after,
            reason=reason,
            ai_action_id=ai_action_id,
            package_id=package_id,
            payment_ref=payment_ref,
            meta=meta,
        )
        self._s.add(entry)
        await self._s.flush()
        return entry

    async def list_ledger_for_user(
        self,
        user_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[CreditLedger]:
        stmt = (
            select(CreditLedger)
            .where(CreditLedger.user_id == user_id)
            .order_by(CreditLedger.created_at.desc(), CreditLedger.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return (await self._s.scalars(stmt)).all()

    async def list_enabled_packages(self) -> Sequence[CreditPackage]:
        stmt = (
            select(CreditPackage)
            .where(CreditPackage.enabled.is_(True))
            .order_by(CreditPackage.sort_order)
        )
        return (await self._s.scalars(stmt)).all()
