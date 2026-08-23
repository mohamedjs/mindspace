from typing import Any


class AppError(Exception):
    def __init__(
        self,
        status: int = 500,
        code: str = "internal_error",
        message: str = "An internal error occurred",
        **extra: Any,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra


class UnauthorizedError(AppError):
    def __init__(self, message: str = "missing Authorization header", **extra: Any) -> None:
        super().__init__(status=401, code="unauthorized", message=message, **extra)


class InvalidCredentialsError(AppError):
    def __init__(self, message: str = "invalid email or password", **extra: Any) -> None:
        super().__init__(status=401, code="invalid_credentials", message=message, **extra)


class InvalidTokenError(AppError):
    def __init__(self, message: str = "invalid token", **extra: Any) -> None:
        super().__init__(status=401, code="invalid_token", message=message, **extra)


class TokenExpiredError(AppError):
    def __init__(self, message: str = "token expired", **extra: Any) -> None:
        super().__init__(status=401, code="token_expired", message=message, **extra)


class ForbiddenError(AppError):
    def __init__(self, message: str = "forbidden", **extra: Any) -> None:
        super().__init__(status=403, code="forbidden", message=message, **extra)


class EmailNotConfirmedError(AppError):
    def __init__(self, message: str = "email not confirmed", **extra: Any) -> None:
        super().__init__(status=403, code="email_not_confirmed", message=message, **extra)


class NotFoundError(AppError):
    def __init__(
        self,
        code: str = "not_found",
        message: str = "resource not found",
        **extra: Any,
    ) -> None:
        super().__init__(status=404, code=code, message=message, **extra)


class BadRequestError(AppError):
    def __init__(
        self,
        code: str = "bad_request",
        message: str = "bad request",
        **extra: Any,
    ) -> None:
        super().__init__(status=400, code=code, message=message, **extra)


class ConflictError(AppError):
    def __init__(
        self,
        code: str = "conflict",
        message: str = "conflict",
        **extra: Any,
    ) -> None:
        super().__init__(status=409, code=code, message=message, **extra)


class EmailTakenError(AppError):
    def __init__(self, message: str = "email already registered", **extra: Any) -> None:
        super().__init__(status=409, code="email_taken", message=message, **extra)


class WeakPasswordError(AppError):
    def __init__(self, message: str = "password is too weak", **extra: Any) -> None:
        super().__init__(status=400, code="weak_password", message=message, **extra)


class InsufficientCreditsError(AppError):
    def __init__(self, message: str = "insufficient credits", **extra: Any) -> None:
        super().__init__(status=402, code="insufficient_credits", message=message, **extra)


class PaymentNotVerifiedError(AppError):
    def __init__(self, reason: str = "verification failed", **extra: Any) -> None:
        super().__init__(
            status=402,
            code="payment_not_verified",
            message="payment could not be verified",
            reason=reason,
            **extra,
        )


class AmountMismatchError(AppError):
    def __init__(
        self,
        message: str = "amount paid does not match plan price",
        **extra: Any,
    ) -> None:
        super().__init__(status=402, code="amount_mismatch", message=message, **extra)


class ProviderNotConfiguredError(AppError):
    def __init__(self, channel: str, missing: list[str], **extra: Any) -> None:
        super().__init__(
            status=501,
            code="provider_not_configured",
            message="payment provider not configured",
            channel=channel,
            missing=missing,
            **extra,
        )


class ProviderTimeoutError(AppError):
    def __init__(self, message: str = "AI provider timed out", **extra: Any) -> None:
        super().__init__(status=504, code="provider_timeout", message=message, **extra)


class ProviderError(AppError):
    def __init__(self, message: str = "AI provider returned an error", **extra: Any) -> None:
        super().__init__(status=502, code="provider_error", message=message, **extra)


class NoPlatformKeyError(AppError):
    def __init__(self, message: str = "no platform key configured", **extra: Any) -> None:
        super().__init__(status=500, code="no_platform_key", message=message, **extra)


class UnsupportedProviderError(AppError):
    def __init__(self, message: str = "unsupported provider", **extra: Any) -> None:
        super().__init__(status=500, code="unsupported_provider", message=message, **extra)


class NoModelAvailableError(AppError):
    def __init__(self, message: str = "no model available", **extra: Any) -> None:
        super().__init__(status=500, code="no_model_available", message=message, **extra)


class ByokRequiredError(AppError):
    def __init__(self, message: str = "BYOK key required for this model", **extra: Any) -> None:
        super().__init__(status=400, code="byok_required", message=message, **extra)


class InvalidKeyFormatError(AppError):
    def __init__(self, message: str = "invalid API key format", **extra: Any) -> None:
        super().__init__(status=400, code="invalid_key_format", message=message, **extra)


class KeyValidationFailedError(AppError):
    def __init__(
        self,
        message: str = "This key was rejected by the provider.",
        **extra: Any,
    ) -> None:
        super().__init__(status=400, code="key_validation_failed", message=message, **extra)


class InternalError(AppError):
    def __init__(self, message: str = "An internal error occurred", **extra: Any) -> None:
        super().__init__(status=500, code="internal_error", message=message, **extra)
