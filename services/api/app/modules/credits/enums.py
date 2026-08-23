from enum import StrEnum


class LedgerReason(StrEnum):
    signup_grant = "signup_grant"
    monthly_refill = "monthly_refill"
    purchase = "purchase"
    usage = "usage"
    refund = "refund"
    reversal = "reversal"
    admin_adjust = "admin_adjust"
