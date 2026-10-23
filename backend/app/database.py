from functools import lru_cache
from typing import Literal, NamedTuple

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.config import get_settings

REQUIRED_TABLES = (
    "codeforces_users",
    "codeforces_problems",
    "codeforces_submissions",
    "roadmap_progress",
    "code_reviews",
)


class DatabaseReadiness(NamedTuple):
    connected: bool
    reason: Literal[
        "not_configured", "dns_failure", "authentication_failed",
        "connection_failed", "missing_tables", "database_error",
    ] | None = None
    missing_tables: tuple[str, ...] = ()


@lru_cache
def get_engine() -> Engine:
    database_url = get_settings().database_url
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    return create_engine(
        database_url, pool_pre_ping=True, pool_size=5, max_overflow=5,
        connect_args={"connect_timeout": 8},
    )


def check_database() -> DatabaseReadiness:
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
            present = {
                name for name in REQUIRED_TABLES
                if connection.scalar(text("SELECT to_regclass(:table_name)"),
                                     {"table_name": f"public.{name}"}) is not None
            }
        missing = tuple(name for name in REQUIRED_TABLES if name not in present)
        if missing:
            return DatabaseReadiness(False, "missing_tables", missing)
        return DatabaseReadiness(True)
    except RuntimeError:
        return DatabaseReadiness(False, "not_configured")
    except Exception as exc:
        original = getattr(exc, "orig", exc)
        state = getattr(original, "sqlstate", None)
        if state in {"28P01", "28000"}:
            return DatabaseReadiness(False, "authentication_failed")
        # psycopg may report a DNS failure without SQLSTATE. Keep its text out of the API.
        message = str(original).lower()
        if any(phrase in message for phrase in (
            "could not translate host name", "name or service not known",
            "nodename nor servname provided", "temporary failure in name resolution",
        )):
            return DatabaseReadiness(False, "dns_failure")
        if state is None:
            return DatabaseReadiness(False, "connection_failed")
        return DatabaseReadiness(False, "database_error")


def get_session():
    try:
        engine = get_engine()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "database_unavailable", "message": "Database is not configured"},
        ) from exc
    with Session(engine) as session:
        yield session
