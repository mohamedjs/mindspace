from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SignUpRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)
    full_name: str | None = None


class SignInRequest(BaseModel):
    email: str
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ResetPasswordRequest(BaseModel):
    email: str


class ResetPasswordConfirmRequest(BaseModel):
    token: str
    password: str = Field(min_length=6)


class UserOut(BaseModel):
    id: UUID
    email: str | None = None
    user_metadata: dict[str, Any] = Field(default_factory=dict)
    is_anonymous: bool = False


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 3600
    user: UserOut


class SignUpResponse(BaseModel):
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int = 3600
    user: UserOut
    session: TokenPair | None = None


class ProfileOut(BaseModel):
    display_name: str | None = None
    email: str | None = None


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str | None = None


class SessionOut(BaseModel):
    user: UserOut
