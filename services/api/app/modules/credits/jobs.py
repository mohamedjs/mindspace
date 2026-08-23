import logging
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import async_session_factory
from app.core.models import Profile
from app.modules.credits.enums import LedgerReason
from app.modules.credits.models import CreditLedger, CreditReservation

logger = logging.getLogger("credits.jobs")


def add_one_month(sourcedate: date) -> date:
    # Safely advance 1 month
    month = sourcedate.month + 1
    year = sourcedate.year
    if month > 12:
        month = 1
        year += 1
    # Handle month day overflow
    day = min(sourcedate.day, 28)
    return date(year, month, day)


async def expire_stale_reservations(session: AsyncSession) -> int:
    now = datetime.now(UTC)
    stmt = (
        select(CreditReservation)
        .where(
            CreditReservation.status == "held",
            CreditReservation.expires_at < now,
        )
        .with_for_update()
    )
    reservations = (await session.scalars(stmt)).all()
    count = 0

    for res in reservations:
        profile_stmt = select(Profile).where(Profile.id == res.user_id).with_for_update()
        profile = await session.scalar(profile_stmt)
        if profile:
            profile.credits_reserved = max(0, profile.credits_reserved - res.amount)

        res.status = "expired"
        count += 1

    if count > 0:
        await session.flush()
        logger.info("Expired %d stale credit reservations", count)
    return count


async def process_monthly_refills(session: AsyncSession) -> int:
    today = date.today()
    # Find all profiles due for refill
    stmt = select(Profile).where(Profile.free_refill_at <= today).with_for_update()
    profiles = (await session.scalars(stmt)).all()
    refilled_count = 0

    for p in profiles:
        next_refill = add_one_month(p.free_refill_at or today)
        p.free_refill_at = next_refill

        # Only grant credits if balance is less than 100
        if p.credits_balance < 100:
            delta = 100 - p.credits_balance
            p.credits_balance = 100

            ledger = CreditLedger(
                user_id=p.id,
                delta=delta,
                balance_after=100,
                reason=LedgerReason.monthly_refill,
            )
            session.add(ledger)
            refilled_count += 1

    if profiles:
        await session.flush()
        logger.info(
            "Processed monthly refill for %d profiles (%d topped up)", len(profiles), refilled_count
        )
    return refilled_count


async def run_expire_stale_reservations_job() -> None:
    async with async_session_factory() as session:
        async with session.begin():
            await expire_stale_reservations(session)


async def run_monthly_refills_job() -> None:
    async with async_session_factory() as session:
        async with session.begin():
            await process_monthly_refills(session)
