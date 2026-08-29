from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.models import User
from app.modules.auth.deps import current_user
from app.modules.auth.schemas import (
    ProfileOut,
    ProfilePatch,
    RefreshTokenRequest,
    ResetPasswordConfirmRequest,
    ResetPasswordRequest,
    SessionOut,
    SignInRequest,
    SignUpRequest,
    TokenPair,
    UserOut,
)
from app.modules.auth.service import AccountService, AuthService

auth_router = APIRouter(prefix="/auth", tags=["auth"])
account_router = APIRouter(prefix="/account", tags=["account"])


@auth_router.post("/sign-up", response_model=TokenPair, status_code=status.HTTP_200_OK)
async def sign_up(
    body: SignUpRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenPair:
    svc = AuthService(session)
    return await svc.register(
        email=body.email,
        password=body.password,
        full_name=body.full_name,
    )


@auth_router.post("/sign-in", response_model=TokenPair)
async def sign_in(
    body: SignInRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenPair:
    svc = AuthService(session)
    return await svc.authenticate(email=body.email, password=body.password)


@auth_router.post("/refresh", response_model=TokenPair)
async def refresh(
    body: RefreshTokenRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenPair:
    svc = AuthService(session)
    return await svc.refresh(body.refresh_token)


@auth_router.post("/sign-out", status_code=status.HTTP_204_NO_CONTENT)
async def sign_out(
    body: RefreshTokenRequest | None = None,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = AuthService(session)
    token = body.refresh_token if body else None
    await svc.sign_out(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@auth_router.post("/reset-password", status_code=status.HTTP_202_ACCEPTED)
async def reset_password(
    body: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    svc = AuthService(session)
    await svc.request_password_reset(body.email)
    return {"ok": True}


@auth_router.post("/reset-password/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password_confirm(
    body: ResetPasswordConfirmRequest,
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = AuthService(session)
    await svc.confirm_password_reset(body.token, body.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@auth_router.get("/session", response_model=SessionOut)
async def get_session_info(
    user: User = Depends(current_user),
) -> SessionOut:
    return SessionOut(
        user=UserOut(
            id=user.id,
            email=user.email,
            user_metadata=user.raw_user_meta_data or {},
            is_anonymous=user.is_anonymous,
        )
    )


# ---- Account Router ----------------------------------------------------------


@account_router.get("/profile", response_model=ProfileOut)
async def get_profile(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileOut:
    svc = AccountService(session)
    return await svc.get_profile(user.id)


@account_router.patch("/profile", status_code=status.HTTP_204_NO_CONTENT)
async def patch_profile(
    body: ProfilePatch,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = AccountService(session)
    await svc.update_display_name(user.id, body.display_name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@account_router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    svc = AccountService(session)
    await svc.delete_account(user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
