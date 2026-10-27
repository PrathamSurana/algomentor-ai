import json
from unittest.mock import Mock, patch
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from google.genai import errors
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user
from app.config import Settings
from app.database import get_session
from app.main import app
from app.models import Base, CodeReview, Problem
from app.review_provider import ReviewProvider, ReviewProviderError, get_review_provider
from app.review_schemas import ReviewRequest

USER_1 = UUID("11111111-1111-1111-1111-111111111111")
USER_2 = UUID("22222222-2222-2222-2222-222222222222")
CODE = "def solve(values):\n    return sum(values)\n"
FEEDBACK = {
    "approach_summary": "Sums the input values.",
    "time_complexity": {"estimate": "O(n)", "reasoning": "Each value is visited once."},
    "space_complexity": {"estimate": "O(1)", "reasoning": "Only an accumulator is used."},
    "potential_edge_cases": ["Empty input."],
    "suggested_improvements": ["Document expected input types."],
    "uncertainty_notes": ["No problem constraints were provided."],
}


@pytest.mark.parametrize("provider,key_name", [
    ("openai", "OPENAI_API_KEY"),
    ("gemini", "GEMINI_API_KEY"),
])
def test_missing_selected_provider_key_returns_sanitized_503(monkeypatch, provider, key_name):
    from app import review_provider

    settings = Settings(
        _env_file=None, ai_provider=provider, openai_api_key=None, gemini_api_key=None
    )
    monkeypatch.setattr(review_provider, "get_settings", lambda: settings)
    app.dependency_overrides[get_current_user] = lambda: USER_1
    app.dependency_overrides[get_session] = lambda: object()
    try:
        response = TestClient(app, raise_server_exceptions=False).post(
            "/reviews", json={"language": "python", "code": CODE}
        )
        assert response.status_code == 503
        assert response.json() == {"detail": {
            "code": "provider_unconfigured",
            "message": f"Configure {key_name} on the backend and restart the API.",
        }}
    finally:
        app.dependency_overrides.clear()


def test_openai_key_requires_explicit_openai_provider():
    settings = Settings(
        _env_file=None, ai_provider="gemini", openai_api_key="test-key", gemini_api_key=None
    )
    with httpx.Client() as client:
        try:
            ReviewProvider(settings, client)
            raise AssertionError("Expected missing Gemini key")
        except ReviewProviderError as exc:
            assert exc.code == "provider_unconfigured"
            assert "GEMINI_API_KEY" in exc.message


def test_provider_adapters_parse_structured_feedback():
    def respond(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert request.url.path == "/v1/chat/completions"
        assert CODE in json.loads(payload["messages"][1]["content"])["source_code"]
        assert payload["response_format"]["json_schema"]["strict"] is True
        return httpx.Response(200, json={
            "choices": [{"message": {"content": json.dumps(FEEDBACK)}}]
        })

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        provider = ReviewProvider(
            Settings(_env_file=None, ai_provider="openai", openai_api_key="test-key"), client
        )
        result = provider.review(ReviewRequest(language="python", code=CODE), None)
        assert result.time_complexity.estimate == "O(n)"


def test_gemini_sdk_uses_structured_json_and_validates_feedback():
    sdk = Mock()
    sdk.models.generate_content.return_value.text = json.dumps(FEEDBACK)
    provider = ReviewProvider(
        Settings(_env_file=None, ai_provider="gemini", gemini_api_key="test-key",
                 gemini_model="gemini-3.5-flash-lite"),
        gemini_client=sdk,
    )
    feedback = provider.review(ReviewRequest(language="cpp", code="int main() { return 0; }"), None)
    assert feedback.approach_summary == FEEDBACK["approach_summary"]
    kwargs = sdk.models.generate_content.call_args.kwargs
    assert kwargs["model"] == "gemini-3.5-flash-lite"
    assert json.loads(kwargs["contents"])["language"] == "cpp"
    assert kwargs["config"].response_mime_type == "application/json"
    assert kwargs["config"].response_json_schema["required"] == list(FEEDBACK)
    assert "correctness issues" in kwargs["config"].system_instruction
    assert "improved approach" in kwargs["config"].system_instruction

    sdk.models.generate_content.return_value.text = '{"approach_summary":"incomplete"}'
    with pytest.raises(ReviewProviderError) as invalid:
        provider.review(ReviewRequest(language="python", code=CODE), None)
    assert invalid.value.code == "provider_invalid_response"


@pytest.mark.parametrize("status,payload,expected_code,attempts", [
    (404, {"message": "invalid model"}, "provider_model_unavailable", 1),
    (403, {"message": "secret diagnostic"}, "provider_auth_failed", 1),
    (429, {"error": {"message": "quota exceeded", "details": [
        {"reason": "QUOTA_EXHAUSTED"}
    ]}}, "provider_quota_exhausted", 1),
    (429, {"error": {"message": "rate_limit_exceeded"}}, "provider_rate_limited", 1),
    (503, {"message": "unavailable"}, "provider_unavailable", 2),
])
def test_gemini_errors_are_sanitized_and_only_transient_failures_retry(
    status, payload, expected_code, attempts,
):
    sdk = Mock()
    sdk.models.generate_content.side_effect = errors.APIError(status, payload)
    provider = ReviewProvider(
        Settings(_env_file=None, ai_provider="gemini", gemini_api_key="test-key"),
        gemini_client=sdk,
    )
    with patch("app.review_provider.time.sleep"):
        with pytest.raises(ReviewProviderError) as failure:
            provider.review(ReviewRequest(language="python", code=CODE), None)
    assert failure.value.code == expected_code
    assert "secret diagnostic" not in failure.value.message
    assert sdk.models.generate_content.call_count == attempts


def test_gemini_timeout_is_sanitized():
    sdk = Mock()
    sdk.models.generate_content.side_effect = httpx.TimeoutException("secret diagnostic")
    provider = ReviewProvider(
        Settings(_env_file=None, ai_provider="gemini", gemini_api_key="test-key"),
        gemini_client=sdk,
    )
    with patch("app.review_provider.time.sleep"):
        with pytest.raises(ReviewProviderError) as failure:
            request = ReviewRequest(language="java", code="class Main { static int x = 1; }")
            provider.review(request, None)
    assert failure.value.code == "provider_timeout"
    assert failure.value.status_code == 504
    assert "secret diagnostic" not in failure.value.message
    assert sdk.models.generate_content.call_count == 2


def test_provider_rejects_invalid_output_and_retries_transient_failures():
    calls = 0

    def respond(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls < 3:
            return httpx.Response(429)
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    provider = ReviewProvider(
        Settings(ai_provider="openai", openai_api_key="test-key"),
        httpx.Client(transport=httpx.MockTransport(respond)),
    )
    with patch("app.review_provider.time.sleep"):
        try:
            provider.review(ReviewRequest(language="python", code=CODE), None)
            raise AssertionError("Expected invalid feedback")
        except ReviewProviderError as exc:
            assert exc.code == "provider_invalid_response"
    assert calls == 3


def test_review_routes_validate_save_history_and_isolate_users():
    assert TestClient(app).get("/reviews").status_code == 401
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)

    def session_override():
        with Session(engine) as session:
            yield session

    provider = Mock()
    provider.provider = "openai"
    provider.model = "test-model"
    from app.review_schemas import ReviewFeedback

    provider.review.return_value = ReviewFeedback.model_validate(FEEDBACK)
    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_current_user] = lambda: USER_1
    app.dependency_overrides[get_review_provider] = lambda: provider
    try:
        with Session(engine) as session:
            session.add(Problem(
                contest_id=1, problem_index="A", name="Sample", rating=800, tags=["math"]
            ))
            session.commit()
        api = TestClient(app)
        assert api.post("/reviews", json={"language": "python", "code": "x"}).status_code == 422
        assert api.post("/reviews", json={
            "language": "python", "code": " " * 21,
        }).status_code == 422
        assert api.post("/reviews", json={
            "language": "python", "code": "x" * 20001,
        }).status_code == 422
        assert api.post("/reviews", json={
            "language": "rust", "code": CODE,
        }).status_code == 422
        assert api.post("/reviews", json={
            "language": "python", "code": CODE, "contest_id": 1,
        }).status_code == 422
        assert api.post("/reviews", json={
            "language": "python", "code": CODE, "contest_id": 2, "problem_index": "A",
        }).status_code == 404
        assert provider.review.call_count == 0
        created = api.post("/reviews", json={
            "language": "python", "code": CODE, "contest_id": 1, "problem_index": "a",
        })
        assert created.status_code == 201, created.text
        record = created.json()
        assert record["feedback"]["approach_summary"] == FEEDBACK["approach_summary"]
        assert record["problem_title"] == "Sample"
        assert provider.review.call_args.args[1]["rating"] == 800
        assert api.get("/reviews").json()["reviews"][0]["id"] == record["id"]
        assert api.get(f"/reviews/{record['id']}").json()["code"] == CODE
        app.dependency_overrides[get_current_user] = lambda: USER_2
        assert api.get("/reviews").json()["reviews"] == []
        assert api.get(f"/reviews/{record['id']}").status_code == 404
        with Session(engine) as session:
            assert session.query(CodeReview).count() == 1
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_review_failure_does_not_save_record():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)

    def session_override():
        with Session(engine) as session:
            yield session

    provider = Mock()
    provider.review.side_effect = ReviewProviderError(
        "provider_unavailable", "AI provider is unavailable", 503
    )
    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_current_user] = lambda: USER_1
    app.dependency_overrides[get_review_provider] = lambda: provider
    try:
        api = TestClient(app)
        result = api.post(
            "/reviews", json={"language": "java", "code": "class Main { static int x = 1; }"}
        )
        assert result.status_code == 503
        assert result.json()["detail"]["code"] == "provider_unavailable"
        assert api.get("/reviews").json()["reviews"] == []
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
