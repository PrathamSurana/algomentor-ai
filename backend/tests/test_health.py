from unittest.mock import patch

from fastapi.testclient import TestClient

from app.database import DatabaseReadiness
from app.main import app


def test_health() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_reports_database_failure_without_details() -> None:
    with patch("app.main.check_database", return_value=DatabaseReadiness(False, "dns_failure")):
        response = TestClient(app).get("/health/ready")
    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable", "database": "unavailable",
        "reason": "dns_failure", "missing_tables": [],
    }


def test_readiness_reports_connected_database() -> None:
    with patch("app.main.check_database", return_value=DatabaseReadiness(True)):
        response = TestClient(app).get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok", "database": "connected", "reason": None, "missing_tables": [],
    }


def test_readiness_reports_missing_migration_tables() -> None:
    state = DatabaseReadiness(False, "missing_tables", ("code_reviews",))
    with patch("app.main.check_database", return_value=state):
        response = TestClient(app).get("/health/ready")
    assert response.status_code == 503
    assert response.json()["missing_tables"] == ["code_reviews"]
