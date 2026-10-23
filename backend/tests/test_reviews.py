from unittest.mock import Mock, patch
from uuid import UUID

import httpx
from fastapi.testclient import TestClient
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


def test_provider_adapters_parse_structured_feedback():
    for name in ("openai", "gemini"):
        def respond(request: httpx.Request, provider_name=name) -> httpx.Response:
            import json

            payload = json.loads(request.content)
            assert CODE in json.loads(
                payload["messages"][1]["content"] if provider_name == "openai"
                else payload["contents"][0]["parts"][0]["text"]
            )["source_code"]
            if provider_name == "openai":
                assert request.url.path == "/v1/chat/completions"
                assert payload["response_format"]["json_schema"]["strict"] is True
                body = {"choices": [{"message": {"content": json.dumps(FEEDBACK)}}]}
            else:
                assert request.url.path.endswith(":generateContent")
                mime_type = payload["generationConfig"]["responseFormat"]["text"]["mimeType"]
                assert mime_type == "application/json"
                body = {"candidates": [{"content": {"parts": [{"text": json.dumps(FEEDBACK)}]}}]}
            return httpx.Response(200, json=body)

        client = httpx.Client(transport=httpx.MockTransport(respond))
        provider = ReviewProvider(Settings(
            ai_provider=name, gemini_api_key="test-key", openai_api_key="test-key"
        ), client)
        result = provider.review(ReviewRequest(language="python", code=CODE), None)
        assert result.time_complexity.estimate == "O(n)"


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
