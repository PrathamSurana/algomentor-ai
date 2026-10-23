"""Validate Supabase access tokens with the project's Auth server."""

from typing import Annotated
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> UUID:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail={"code": "auth_required", "message": "Sign in to access saved work"},
        )
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(
            status_code=503,
            detail={"code": "auth_unconfigured", "message": "Supabase Auth is not configured"},
        )
    try:
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {credentials.credentials}",
            },
            timeout=8.0,
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "auth_unavailable", "message": "Authentication service is unavailable"},
        ) from exc
    if response.status_code != 200:
        if response.status_code >= 500:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "auth_unavailable",
                    "message": "Authentication service is unavailable",
                },
            )
        raise HTTPException(
            status_code=401, detail={"code": "invalid_token", "message": "Sign in again"}
        )
    try:
        return UUID(response.json()["id"])
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "auth_bad_response", "message": "Authentication response is invalid"},
        ) from exc
