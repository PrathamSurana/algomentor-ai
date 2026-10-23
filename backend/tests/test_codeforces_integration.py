from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import codeforces_service
from app.codeforces import CodeforcesClient, get_codeforces_client
from app.database import get_session
from app.main import app
from app.models import Base, CodeforcesUser, Problem


def api_result(result):
    return {"status": "OK", "result": result}


def submission(submission_id: int, index: str, verdict: str = "OK"):
    return {
        "id": submission_id,
        "creationTimeSeconds": 1700000000 + submission_id,
        "verdict": verdict,
        "problem": {
            "contestId": 100,
            "index": index,
            "name": f"Fixture problem {index}",
            "rating": 1200 if index == "A" else 1500,
            "tags": ["implementation"] if index == "A" else ["dp", "implementation"],
        },
    }


@pytest.fixture
def fixture_api():
    calls = []

    def handler(request: httpx.Request):
        calls.append((request.url.path, dict(request.url.params)))
        if request.url.path.endswith("user.info"):
            if request.url.params["handles"] == "missinguser":
                return httpx.Response(
                    200, json={"status": "FAILED", "comment": "handles: User not found"}
                )
            return httpx.Response(
                200,
                json=api_result([{"handle": "FixtureUser", "rating": 1400, "rank": "specialist"}]),
            )
        if request.url.path.endswith("problemset.problems"):
            return httpx.Response(
                200,
                json=api_result(
                    {
                        "problems": [submission(1, "A")["problem"], submission(2, "B")["problem"]],
                        "problemStatistics": [
                            {"contestId": 100, "index": "A", "solvedCount": 1234},
                            {"contestId": 100, "index": "B", "solvedCount": 567},
                        ],
                    }
                ),
            )
        if request.url.path.endswith("user.status"):
            return httpx.Response(
                200,
                json=api_result(
                    [
                        submission(11, "A"),
                        submission(12, "A"),
                        submission(13, "B", "WRONG_ANSWER"),
                        submission(14, "B"),
                    ]
                ),
            )
        raise AssertionError(f"Unexpected request: {request.url}")

    client = CodeforcesClient(transport=httpx.MockTransport(handler), pace_seconds=0)
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)

    def session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_codeforces_client] = lambda: client
    yield TestClient(app), calls, engine
    app.dependency_overrides.clear()
    engine.dispose()


def test_sync_persists_actual_fixture_data_and_deduplicates(fixture_api):
    api, calls, engine = fixture_api
    first = api.post("/codeforces/sync", json={"handle": "FixtureUser"})
    assert first.status_code == 200, first.text
    assert first.json()["new_submissions"] == 4
    assert first.json()["has_more"] is False

    second = api.post("/codeforces/sync", json={"handle": "fixtureuser"})
    assert second.status_code == 200, second.text
    assert second.json()["new_submissions"] == 0

    summary = api.get("/codeforces/users/FIXTUREUSER/summary")
    assert summary.status_code == 200
    body = summary.json()
    assert body["total_submissions"] == 4
    assert body["solved_count"] == 2
    assert body["topic_distribution"] == [
        {"topic": "implementation", "solved_count": 2},
        {"topic": "dp", "solved_count": 1},
    ]
    assert body["solved_problems"][0]["name"] == "Fixture problem B"
    with Session(engine) as session:
        assert session.get(Problem, (100, "A")).solved_count == 1234
    assert any(path.endswith("user.info") for path, _ in calls)
    assert any(path.endswith("user.status") for path, _ in calls)
    assert any(path.endswith("problemset.problems") for path, _ in calls)

    skills = api.get("/codeforces/users/FixtureUser/skills")
    assert skills.status_code == 200
    assessment = skills.json()
    assert assessment["status"] == "insufficient_data"
    topic = next(item for item in assessment["topics"] if item["topic"] == "implementation")
    assert topic["score"] is None
    assert topic["attempted_unique"] == 2
    assert topic["solved_unique"] == 2
    assert "solve_rate" in topic["components"]
    assert topic["rationale"]


def test_invalid_handle_and_missing_user(fixture_api):
    api, calls, _ = fixture_api
    assert api.post("/codeforces/sync", json={"handle": "bad handle"}).status_code == 422
    assert calls == []
    response = api.post("/codeforces/sync", json={"handle": "missinguser"})
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "invalid_handle"


def test_network_failure_is_retryable_and_does_not_save_data(monkeypatch, fixture_api):
    api, _, _ = fixture_api
    failing = CodeforcesClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(503)), pace_seconds=0
    )
    monkeypatch.setattr("app.codeforces.time.sleep", lambda _: None)
    app.dependency_overrides[get_codeforces_client] = lambda: failing
    response = api.post("/codeforces/sync", json={"handle": "FixtureUser"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "codeforces_unavailable"
    assert api.get("/codeforces/users/FixtureUser/summary").status_code == 404


def test_bounded_pagination_can_resume_with_cursor(monkeypatch, fixture_api):
    api, _, _ = fixture_api
    monkeypatch.setattr(codeforces_service, "PAGE_SIZE", 2)
    monkeypatch.setattr(codeforces_service, "MAX_PAGES_PER_SYNC", 1)

    def handler(request: httpx.Request):
        if request.url.path.endswith("user.info"):
            return httpx.Response(200, json=api_result([{"handle": "FixtureUser"}]))
        if request.url.path.endswith("problemset.problems"):
            return httpx.Response(200, json=api_result({"problems": [], "problemStatistics": []}))
        start = int(request.url.params["from"])
        page = [submission(21, "A"), submission(22, "B")] if start == 1 else [submission(23, "A")]
        return httpx.Response(200, json=api_result(page))

    app.dependency_overrides[get_codeforces_client] = lambda: CodeforcesClient(
        transport=httpx.MockTransport(handler), pace_seconds=0
    )
    first = api.post("/codeforces/sync", json={"handle": "FixtureUser"})
    assert first.status_code == 200
    assert first.json()["has_more"] is True
    assert first.json()["total_submissions"] == 2

    second = api.post("/codeforces/sync", json={"handle": "FixtureUser", "mode": "continue"})
    assert second.status_code == 200
    assert second.json()["has_more"] is False
    assert second.json()["total_submissions"] == 3


def test_codeforces_rate_limit_response_is_retried(monkeypatch):
    attempts = 0

    def handler(_request: httpx.Request):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(200, json={"status": "FAILED", "comment": "Call limit exceeded"})
        return httpx.Response(200, json=api_result([{"handle": "FixtureUser"}]))

    monkeypatch.setattr("app.codeforces.time.sleep", lambda _: None)
    client = CodeforcesClient(transport=httpx.MockTransport(handler), pace_seconds=0)
    assert client.profile("FixtureUser")["handle"] == "FixtureUser"
    assert attempts == 2


def test_recommendation_route_uses_saved_catalog_and_filters_solved(fixture_api):
    api, _, engine = fixture_api
    assert api.post("/codeforces/sync", json={"handle": "FixtureUser"}).status_code == 200
    with Session(engine) as session:
        session.add_all(
            [
                Problem(
                    contest_id=200 + index,
                    problem_index="A",
                    name=f"Unsolved fixture {index}",
                    rating=1400,
                    tags=["implementation"],
                    solved_count=100,
                )
                for index in range(6)
            ]
        )
        session.commit()

    response = api.get("/codeforces/users/FixtureUser/recommendations?limit=5")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ready"
    assert len(body["recommendations"]) == 5
    assert all(item["contest_id"] != 100 for item in body["recommendations"])
    assert body["recommendations"][0]["rationale"]
    assert body["recommendations"][0]["contributions"]["difficulty"] >= 0

    with Session(engine) as session:
        session.get(CodeforcesUser, "fixtureuser").next_from = 1001
        session.commit()
    incomplete = api.get("/codeforces/users/FixtureUser/recommendations")
    assert incomplete.status_code == 200
    assert incomplete.json()["status"] == "history_incomplete"
    assert incomplete.json()["recommendations"] == []


def test_recommendation_route_supports_complete_cold_start(fixture_api):
    api, _, engine = fixture_api
    with Session(engine) as session:
        session.add(
            CodeforcesUser(
                handle_key="newbie", handle="Newbie", synced_at=datetime.now(timezone.utc)
            )
        )
        session.add_all(
            [
                Problem(
                    contest_id=300 + index,
                    problem_index="A",
                    name=f"Starter fixture {index}",
                    rating=900 + index * 100,
                    tags=["implementation"],
                )
                for index in range(5)
            ]
        )
        session.commit()
    response = api.get("/codeforces/users/Newbie/recommendations")
    assert response.status_code == 200, response.text
    assert response.json()["cold_start"] is True
    assert response.json()["target_rating"] == 1000
    assert len(response.json()["recommendations"]) == 5


def test_malformed_submission_cannot_mark_history_complete(fixture_api):
    api, _, _ = fixture_api

    def handler(request: httpx.Request):
        if request.url.path.endswith("user.info"):
            return httpx.Response(200, json=api_result([{"handle": "FixtureUser"}]))
        if request.url.path.endswith("problemset.problems"):
            return httpx.Response(200, json=api_result({"problems": [], "problemStatistics": []}))
        return httpx.Response(
            200,
            json=api_result(
                [{"id": 1, "creationTimeSeconds": 1700000000, "verdict": "OK", "problem": {}}]
            ),
        )

    app.dependency_overrides[get_codeforces_client] = lambda: CodeforcesClient(
        transport=httpx.MockTransport(handler), pace_seconds=0
    )
    response = api.post("/codeforces/sync", json={"handle": "FixtureUser"})
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "codeforces_bad_response"
    assert api.get("/codeforces/users/FixtureUser/recommendations").status_code == 404
