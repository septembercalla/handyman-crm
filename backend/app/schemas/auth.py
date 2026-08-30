from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    remember: bool = True


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=72)


class CompleteFirstLoginRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=72)


class TokenPair(BaseModel):
    """Tokens are also set as httpOnly cookies; the body keeps /docs and curl usable."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut
