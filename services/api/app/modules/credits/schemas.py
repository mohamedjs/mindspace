from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.modules.credits.enums import LedgerReason


class BalanceOut(BaseModel):
    balance: int
    reserved: int
    available: int


class CreditLedgerOut(BaseModel):
    id: int
    delta: int
    balance_after: int
    reason: LedgerReason
    package_id: str | None = None
    payment_ref: str | None = None
    meta: dict[str, Any] | None = None
    created_at: datetime


class CreditPackageOut(BaseModel):
    id: str
    name: str
    price_egp: int
    base_credits: int
    bonus_pct: int
    total_credits: int
    is_featured: bool
    store_product_id_ios: str | None = None
    store_product_id_android: str | None = None
