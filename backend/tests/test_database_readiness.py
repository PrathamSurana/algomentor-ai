from pathlib import Path
from unittest.mock import MagicMock, patch

from app.config import ENV_FILE, Settings
from app.database import check_database


def test_backend_env_file_is_independent_of_working_directory(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    assert Path(Settings.model_config["env_file"]) == ENV_FILE
    assert ENV_FILE.parent.name == "backend"


def test_readiness_requires_all_existing_migration_tables():
    connection = MagicMock()
    connection.scalar.side_effect = lambda _query, params: (
        None if params["table_name"] == "public.code_reviews" else params["table_name"]
    )
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value = connection
    with patch("app.database.get_engine", return_value=engine):
        state = check_database()
    assert state.connected is False
    assert state.reason == "missing_tables"
    assert state.missing_tables == ("code_reviews",)


def test_readiness_reports_connected_when_all_tables_exist():
    connection = MagicMock()
    connection.scalar.side_effect = lambda _query, params: params["table_name"]
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value = connection
    with patch("app.database.get_engine", return_value=engine):
        state = check_database()
    assert state.connected is True
    assert state.reason is None
