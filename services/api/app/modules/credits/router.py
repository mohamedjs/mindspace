from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.models import User
from app.modules.auth.deps import current_user
from app.modules.credits.schemas import BalanceOut, CreditLedgerOut, CreditPackageOut
from app.modules.credits.service import CreditService

credits_router = APIRouter(prefix="/credits", tags=["credits"])


@credits_router.get("/balance", response_model=BalanceOut)
async def get_credit_balance(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> BalanceOut:
    svc = CreditService(session)
    balance, reserved = await svc.get_balance(user.id)
    return BalanceOut(
        balance=balance,
        reserved=reserved,
        available=max(0, balance - reserved),
    )


@credits_router.get("/ledger", response_model=list[CreditLedgerOut])
async def get_credit_ledger(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CreditLedgerOut]:
    svc = CreditService(session)
    entries = await svc.list_ledger(user.id, limit=limit, offset=offset)
    return [
        CreditLedgerOut(
            id=e.id,
            delta=e.delta,
            balance_after=e.balance_after,
            reason=e.reason,
            package_id=e.package_id,
            payment_ref=e.payment_ref,
            meta=e.meta,
            created_at=e.created_at,
        )
        for e in entries
    ]


@credits_router.get("/packages", response_model=list[CreditPackageOut])
async def list_packages(
    session: AsyncSession = Depends(get_session),
) -> list[CreditPackageOut]:
    svc = CreditService(session)
    packages = await svc.list_packages()
    return [
        CreditPackageOut(
            id=p.id,
            name=p.name,
            price_egp=p.price_egp,
            base_credits=p.base_credits,
            bonus_pct=p.bonus_pct,
            total_credits=p.total_credits,
            is_featured=p.is_featured,
            store_product_id_ios=p.store_product_id_ios,
            store_product_id_android=p.store_product_id_android,
        )
        for p in packages
    ]
