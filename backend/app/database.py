from functools import lru_cache

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.config import get_settings


@lru_cache
def get_engine() -> Engine:
    database_url = get_settings().database_url
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    return create_engine(database_url, pool_pre_ping=True, pool_size=5, max_overflow=5)


def check_database() -> bool:
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


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
