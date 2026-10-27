"""User-scoped, read-only verified roadmap projection."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.challenge_tree import build_challenge_tree
from app.database import get_session

router = APIRouter(prefix="/roadmap", tags=["roadmap"])


def _missing_roadmap_table(exc: SQLAlchemyError) -> bool:
    original = getattr(exc, "orig", exc)
    sqlstate = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
    return sqlstate == "42P01" or "no such table: roadmap_challenges" in str(original).lower()


class ChallengeResponse(BaseModel):
    tier: str
    contest_id: int
    problem_index: str
    title: str
    rating: int | None
    tags: list[str]
    url: str
    verified: bool
    solved_at: datetime | None
    required: bool


class TopicNodeResponse(BaseModel):
    key: str
    title: str
    pathway: str
    prerequisites: list[str]
    missing_prerequisites: list[str]
    codeforces_tag: str
    state: str
    verified_count: int
    required_count: int
    xp: int
    rank: str
    completed_at: datetime | None
    challenges: list[ChallengeResponse]


class ChallengeTreeResponse(BaseModel):
    handle: str | None
    synced_at: datetime | None
    sync_status: str
    nodes: list[TopicNodeResponse]
    completed_count: int
    total_count: int
    verified_challenges: int
    xp: int
    streak_days: int
    recommended_key: str | None
    achievements: list[dict]


@router.get("/tree", response_model=ChallengeTreeResponse)
def get_challenge_tree(
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    try:
        return build_challenge_tree(session, user_id)
    except SQLAlchemyError as exc:
        session.rollback()
        if _missing_roadmap_table(exc):
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "migration_required",
                    "message": (
                        "Roadmap challenge table is missing. "
                        "Apply migration 006_roadmap_challenges.sql."
                    ),
                },
            ) from exc
        raise HTTPException(
            status_code=503,
            detail={"code": "database_unavailable", "message": "Roadmap data is unavailable"},
        ) from exc
