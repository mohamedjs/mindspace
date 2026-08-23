from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.modules.billing.enums import PaymentChannel, SubscriptionStatus


class SubscriptionPlanOut(BaseModel):
    id: str
    name: str
    tagline: str | None = None
    price_egp: int
    base_credits: int
    bonus_pct: int
    total_credits: int
    is_featured: bool
    enabled: bool
    sort_order: int
    max_recording_minutes: int
    is_byok: bool
    ai_enabled: bool


class SubscribeStartRequest(BaseModel):
    plan_id: str
    channel: PaymentChannel | None = None


class SubscribeStartOut(BaseModel):
    subscription_id: UUID
    free: bool = False
    intent: dict[str, Any] | None = None


class SubscribeConfirmRequest(BaseModel):
    subscription_id: UUID
    receipt: str | None = None
    external_ref: str | None = None


class SubscribeConfirmOut(BaseModel):
    subscription_id: UUID
    status: SubscriptionStatus
    credits_granted: int
    already_active: bool = False


class BuyPackageRequest(BaseModel):
    package_id: str
    channel: PaymentChannel
    receipt: str | None = None
    external_ref: str | None = None


class PaymentOut(BaseModel):
    id: UUID
    status: str
    channel: PaymentChannel
    amount_egp: int
    credits_granted: int
    created_at: datetime


class SubscriptionOut(BaseModel):
    id: UUID
    plan_id: str
    status: SubscriptionStatus
    channel: PaymentChannel
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancelled_at: datetime | None = None
