from datetime import datetime, timezone
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user
from app.challenge_tree import TOPICS, Topic, validate_topics
from app.codeforces import CodeforcesClient, get_codeforces_client
from app.database import get_session
from app.main import app
from app.models import (
    Base,
    CodeforcesRatingChange,
    LinkedPlatformAccount,
    RoadmapChallenge,
    Submission,
)

USER = UUID("11111111-1111-1111-1111-111111111111")
OTHER = UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def verified_api():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    problems = [
        {
            "contestId": 100 + index,
            "index": "A",
            "name": f"Official fixture {index}",
            "rating": 800 + index * 100,
            "tags": ["implementation"],
        }
        for index in range(5)
    ]

    def handler(request: httpx.Request):
        path = request.url.path
        if path.endswith("user.info"):
            data = [{"handle": "FixtureUser", "rating": 1200, "rank": "pupil"}]
        elif path.endswith("problemset.problems"):
            data = {"problems": problems, "problemStatistics": []}
        elif path.endswith("user.status"):
            data = [
                {
                    "id": identifier,
                    "creationTimeSeconds": 1700000000 + identifier,
                    "verdict": verdict,
                    "problem": problems[index],
                }
                for identifier, index, verdict in [
                    (10, 0, "OK"),
                    (11, 0, "OK"),
                    (12, 1, "OK"),
                    (13, 2, "WRONG_ANSWER"),
                    (14, 3, "OK"),
                ]
            ]
        elif path.endswith("user.rating"):
            data = [
                {
                    "contestId": 500,
                    "contestName": "Official contest",
                    "ratingUpdateTimeSeconds": 1700000000,
                    "oldRating": 0,
                    "newRating": 1200,
                    "rank": 123,
                }
            ]
        else:
            raise AssertionError(path)
        return httpx.Response(200, json={"status": "OK", "result": data})

    def session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_current_user] = lambda: USER
    app.dependency_overrides[get_codeforces_client] = lambda: CodeforcesClient(
        transport=httpx.MockTransport(handler), pace_seconds=0
    )
    yield TestClient(app), engine
    app.dependency_overrides.clear()
    engine.dispose()


def test_authenticated_sync_verifies_historical_solves_and_is_idempotent(verified_api):
    api, engine = verified_api
    sync = api.post("/platforms/codeforces/sync", json={"username": "FixtureUser"})
    assert sync.status_code == 200, sync.text
    assert sync.json()["new_submissions"] == 5
    assert sync.json()["rating_history_status"] == "ready"
    first = api.get("/roadmap/tree")
    assert first.status_code == 200, first.text
    root = next(node for node in first.json()["nodes"] if node["key"] == "implementation")
    assert len(root["challenges"]) == 3
    assert root["verified_count"] == 2
    assert root["state"] == "ready"
    assert all(item["title"].startswith("Official fixture") for item in root["challenges"])
    assert all(item["url"].startswith("https://codeforces.com/") for item in root["challenges"])
    arrays = next(node for node in first.json()["nodes"] if node["key"] == "arrays")
    assert arrays["state"] == "locked"
    assert arrays["missing_prerequisites"] == ["implementation"]

    repeated = api.post("/platforms/codeforces/sync", json={"username": "fixtureuser"})
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["new_submissions"] == 0
    again = api.get("/roadmap/tree").json()
    assert again["verified_challenges"] == first.json()["verified_challenges"]
    with Session(engine) as session:
        assert len(session.scalars(select(RoadmapChallenge)).all()) == 5
        assert len(session.scalars(select(CodeforcesRatingChange)).all()) == 1
        assert len(session.scalars(select(LinkedPlatformAccount)).all()) == 1

    analytics = api.get("/analytics")
    assert analytics.status_code == 200, analytics.text
    body = analytics.json()
    assert body["kpis"]["distinct_solves"] == 3
    assert body["attempt_vs_accepted"]["accepted_submissions"] == 4
    assert len(body["rating_history"]) == 1
    assert body["roadmap"]["verified_challenges"] == first.json()["verified_challenges"]

    missing = next(item for item in root["challenges"] if not item["verified"])
    with Session(engine) as session:
        session.add(
            Submission(
                submission_id=99,
                handle_key="fixtureuser",
                contest_id=missing["contest_id"],
                problem_index=missing["problem_index"],
                verdict="OK",
                created_at=datetime(2026, 10, 26, tzinfo=timezone.utc),
                tags_at_import=missing["tags"],
            )
        )
        session.commit()
    unlocked = api.get("/roadmap/tree").json()
    completed_root = next(node for node in unlocked["nodes"] if node["key"] == "implementation")
    unlocked_arrays = next(node for node in unlocked["nodes"] if node["key"] == "arrays")
    assert completed_root["state"] == "completed"
    assert completed_root["verified_count"] == 3
    assert unlocked_arrays["state"] == "ready"
    assert unlocked["completed_count"] == 1
    assert unlocked["achievements"][0]["key"] == "topics_1"


def test_account_ownership_is_enforced(verified_api):
    api, _ = verified_api
    response = api.post("/platforms/codeforces/sync", json={"username": "FixtureUser"})
    assert response.status_code == 200
    app.dependency_overrides[get_current_user] = lambda: OTHER
    assert api.get("/platforms/accounts").json()["accounts"] == []
    tree = api.get("/roadmap/tree").json()
    assert tree["handle"] is None
    assert tree["verified_challenges"] == 0
    assert api.post("/platforms/codeforces/ratings/sync").status_code == 404


def test_tree_requires_authentication(verified_api):
    api, _ = verified_api
    override = app.dependency_overrides.pop(get_current_user)
    try:
        response = api.get("/roadmap/tree")
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "auth_required"
    finally:
        app.dependency_overrides[get_current_user] = override


def test_missing_challenge_migration_has_actionable_error(verified_api):
    api, engine = verified_api
    sync = api.post("/platforms/codeforces/sync", json={"username": "FixtureUser"})
    assert sync.status_code == 200
    RoadmapChallenge.__table__.drop(bind=engine)
    response = api.get("/roadmap/tree")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "migration_required"
    assert "006_roadmap_challenges.sql" in response.json()["detail"]["message"]


def test_prerequisite_graph_is_branching_and_acyclic():
    validate_topics(TOPICS)
    assert len(TOPICS) == 38
    assert any(len(topic.prerequisites) > 1 for topic in TOPICS)
    with pytest.raises(ValueError, match="cycle"):
        validate_topics(
            (
                Topic("a", "A", ("b",), "implementation", "X"),
                Topic("b", "B", ("a",), "implementation", "X"),
            )
        )
