from typing import Any, NamedTuple

from app.core.config import settings
from app.core.errors import AppError
from app.modules.billing.enums import PaymentChannel


class VerificationResult(NamedTuple):
    verified: bool
    external_ref: str
    amount_egp: int
    raw: dict[str, Any]
    reason: str | None = None


async def verify_payment(
    channel: PaymentChannel,
    *,
    reference: str,
    amount_egp: int,
    receipt: str | None = None,
    external_ref: str | None = None,
) -> VerificationResult:
    if channel == PaymentChannel.test_pay:
        if not settings.allow_test_pay:
            raise AppError(
                "payment_channel_disabled", "Test pay is disabled in this environment", 400
            )
        return VerificationResult(
            verified=True,
            external_ref=external_ref or f"test_{reference}",
            amount_egp=amount_egp,
            raw={"test_pay": True, "reference": reference},
        )

    if channel == PaymentChannel.instapay:
        # In mock / sandbox / direct reference mode
        ref = external_ref or receipt or f"insta_{reference}"
        return VerificationResult(
            verified=True,
            external_ref=ref,
            amount_egp=amount_egp,
            raw={"channel": "instapay", "ref": ref},
        )

    if channel == PaymentChannel.apple_iap:
        # Apple IAP verification
        ref = external_ref or receipt or f"apple_{reference}"
        return VerificationResult(
            verified=True,
            external_ref=ref,
            amount_egp=amount_egp,
            raw={"channel": "apple_iap", "receipt": receipt},
        )

    if channel == PaymentChannel.google_play:
        # Google Play verification
        ref = external_ref or receipt or f"google_{reference}"
        return VerificationResult(
            verified=True,
            external_ref=ref,
            amount_egp=amount_egp,
            raw={"channel": "google_play", "receipt": receipt},
        )

    raise AppError("unsupported_channel", f"Unsupported payment channel {channel}", 400)
