from enum import StrEnum


class PaymentChannel(StrEnum):
    google_pay = "google_pay"
    apple_pay = "apple_pay"
    instapay = "instapay"
    test_pay = "test_pay"


class SubscriptionStatus(StrEnum):
    pending = "pending"
    active = "active"
    cancelled = "cancelled"
    expired = "expired"
