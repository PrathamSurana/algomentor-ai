from uuid import UUID

import httpx
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import auth
from app.config import Settings


def test_supabase_auth_validates_token_with_auth_server(monkeypatch):
    user_id = "11111111-1111-1111-1111-111111111111"
    monkeypatch.setattr(auth, "get_settings", lambda: Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="public-test-key",
    ))

    def fake_get(url, *, headers, timeout):
        assert url == "https://example.supabase.co/auth/v1/user"
        assert headers["apikey"] == "public-test-key"
        assert headers["Authorization"] == "Bearer valid-test-token"
        assert timeout == 8.0
        return httpx.Response(200, json={"id": user_id})

    monkeypatch.setattr(auth.httpx, "get", fake_get)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-test-token")
    assert auth.get_current_user(credentials) == UUID(user_id)


def test_auth_rejects_missing_and_invalid_tokens(monkeypatch):
    with pytest.raises(HTTPException) as missing:
        auth.get_current_user(None)
    assert missing.value.status_code == 401

    monkeypatch.setattr(auth, "get_settings", lambda: Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="public-test-key",
    ))
    monkeypatch.setattr(auth.httpx, "get", lambda *args, **kwargs: httpx.Response(401))
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad-token")
    with pytest.raises(HTTPException) as invalid:
        auth.get_current_user(credentials)
    assert invalid.value.status_code == 401


def test_auth_handles_expired_token_and_auth_service_failure(monkeypatch):
    monkeypatch.setattr(auth, "get_settings", lambda: Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="public-test-key",
    ))
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="expired-token")
    monkeypatch.setattr(auth.httpx, "get", lambda *args, **kwargs: httpx.Response(401))
    with pytest.raises(HTTPException) as expired:
        auth.get_current_user(credentials)
    assert expired.value.status_code == 401
    assert expired.value.detail["code"] == "invalid_token"

    monkeypatch.setattr(auth.httpx, "get", lambda *args, **kwargs: httpx.Response(503))
    with pytest.raises(HTTPException) as unavailable:
        auth.get_current_user(credentials)
    assert unavailable.value.status_code == 503
    assert unavailable.value.detail["code"] == "auth_unavailable"

    monkeypatch.setattr(auth.httpx, "get", lambda *args, **kwargs: httpx.Response(
        200, text="not json"
    ))
    with pytest.raises(HTTPException) as malformed:
        auth.get_current_user(credentials)
    assert malformed.value.status_code == 503
    assert malformed.value.detail["code"] == "auth_bad_response"
