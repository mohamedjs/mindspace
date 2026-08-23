from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import AppError


def _code_for_status(status_code: int) -> str:
    codes = {
        400: "bad_request",
        401: "unauthorized",
        402: "insufficient_credits",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        422: "validation_error",
        500: "internal_error",
        501: "not_implemented",
        502: "provider_error",
        504: "provider_timeout",
    }
    return codes.get(status_code, "error")


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    content = {"error": exc.code, "message": exc.message, **exc.extra}
    return JSONResponse(status_code=exc.status, content=content)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": "validation_error", "message": str(exc)},
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = _code_for_status(exc.status_code)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": code, "message": str(exc.detail)},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "message": "An unexpected error occurred"},
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
