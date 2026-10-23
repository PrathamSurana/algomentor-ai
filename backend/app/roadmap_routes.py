from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel
from sqlalchemy import delete, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.codeforces import HANDLE_PATTERN
from app.codeforces_service import get_skill_assessment
from app.database import get_session
from app.models import RoadmapProgress
from app.roadmap_engine import BY_KEY, build_roadmap, can_reopen

router = APIRouter(prefix="/roadmap", tags=["roadmap"])
HandleQuery = Annotated[
    str | None, Query(min_length=1, max_length=24, pattern=HANDLE_PATTERN.pattern)
]


class MilestoneResponse(BaseModel):
    key: str
    title: str
    description: str
    prerequisites: list[str]
    missing_prerequisites: list[str]
    state: Literal["locked", "ready", "completed"]
    completed: bool
    proficiency_score: int | None
    proficiency_confidence: str
    skill_tag: str | None
    skill_source: Literal["direct", "proxy", "none"]
    order: int


class RoadmapResponse(BaseModel):
    version: str
    recommended_key: str | None
    recommendation_reason: str | None
    completed_count: int
    total_count: int
    milestones: list[MilestoneResponse]


class ProgressUpdate(BaseModel):
    completed: bool


def _progress(session: Session, user_id: UUID, handle: str | None) -> dict:
    completed = set(
        session.scalars(
            select(RoadmapProgress.milestone_key).where(RoadmapProgress.user_id == user_id)
        ).all()
    )
    assessment = get_skill_assessment(session, handle) if handle else None
    return build_roadmap(completed, assessment["topics"] if assessment else None)


def _database_error(exc: SQLAlchemyError) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={"code": "database_unavailable", "message": "Database is unavailable"},
    )


@router.get("", response_model=RoadmapResponse)
def get_roadmap(
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    handle: HandleQuery = None,
) -> dict:
    try:
        return _progress(session, user_id, handle)
    except SQLAlchemyError as exc:
        raise _database_error(exc) from exc


@router.patch("/{key}", response_model=RoadmapResponse)
def update_progress(
    key: Annotated[str, Path(min_length=1, max_length=40)],
    update: ProgressUpdate,
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    handle: HandleQuery = None,
) -> dict:
    if key not in BY_KEY:
        raise HTTPException(
            status_code=404, detail={"code": "unknown_milestone", "message": "Unknown milestone"}
        )
    try:
        if session.bind.dialect.name == "postgresql":
            session.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:user_id)::bigint)"),
                {"user_id": str(user_id)},
            )
        current = _progress(session, user_id, handle)
        milestone = next(item for item in current["milestones"] if item["key"] == key)
        if update.completed:
            if milestone["state"] == "locked":
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "prerequisites_incomplete",
                        "message": "Complete prerequisite milestones first",
                    },
                )
            if milestone["state"] != "completed":
                session.add(RoadmapProgress(user_id=user_id, milestone_key=key))
        else:
            completed = {item["key"] for item in current["milestones"] if item["completed"]}
            if key in completed and not can_reopen(key, completed):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "dependent_completed",
                        "message": "Reopen dependent milestones first",
                    },
                )
            session.execute(
                delete(RoadmapProgress).where(
                    RoadmapProgress.user_id == user_id, RoadmapProgress.milestone_key == key
                )
            )
        session.commit()
        return _progress(session, user_id, handle)
    except SQLAlchemyError as exc:
        session.rollback()
        raise _database_error(exc) from exc
