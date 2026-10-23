from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user
from app.database import get_session
from app.main import app
from app.models import Base, RoadmapProgress

USER_1 = UUID("11111111-1111-1111-1111-111111111111")
USER_2 = UUID("22222222-2222-2222-2222-222222222222")


def test_roadmap_progress_is_protected_and_persistent():
    assert TestClient(app).get("/roadmap").status_code == 401
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)

    def session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_current_user] = lambda: USER_1
    try:
        api = TestClient(app)
        assert api.get("/roadmap").json()["recommended_key"] == "arrays"
        locked = api.patch("/roadmap/graphs", json={"completed": True})
        assert locked.status_code == 409
        assert locked.json()["detail"]["code"] == "prerequisites_incomplete"

        first = api.patch("/roadmap/arrays", json={"completed": True})
        assert first.status_code == 200, first.text
        assert first.json()["completed_count"] == 1
        assert api.patch("/roadmap/arrays", json={"completed": True}).json()["completed_count"] == 1
        assert api.get("/roadmap").json()["completed_count"] == 1
        with patch("app.roadmap_routes.get_skill_assessment", return_value={"topics": [
            {"topic": "two pointers", "score": 20, "confidence": "low"},
            {"topic": "binary search", "score": 80, "confidence": "medium"},
        ]}):
            guided = api.get("/roadmap?handle=FixtureUser")
        assert guided.status_code == 200
        assert guided.json()["recommended_key"] == "two_pointers"
        assert api.patch("/roadmap/hashing", json={"completed": True}).status_code == 200
        assert api.patch("/roadmap/arrays", json={"completed": False}).status_code == 409

        app.dependency_overrides[get_current_user] = lambda: USER_2
        assert api.get("/roadmap").json()["completed_count"] == 0
        app.dependency_overrides[get_current_user] = lambda: USER_1
        assert api.patch("/roadmap/hashing", json={"completed": False}).status_code == 200
        assert (
            api.patch("/roadmap/arrays", json={"completed": False}).json()["completed_count"] == 0
        )
        with Session(engine) as session:
            assert session.query(RoadmapProgress).count() == 0
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
