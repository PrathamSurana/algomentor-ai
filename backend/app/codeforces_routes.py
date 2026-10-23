from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.codeforces import HANDLE_PATTERN, CodeforcesClient, CodeforcesError, get_codeforces_client
from app.codeforces_service import (
    get_recommendations,
    get_skill_assessment,
    get_summary,
    sync_handle,
)
from app.database import get_session

router = APIRouter(prefix="/codeforces", tags=["codeforces"])


class SyncRequest(BaseModel):
    handle: str = Field(min_length=1, max_length=24, pattern=HANDLE_PATTERN.pattern)
    mode: Literal["refresh", "continue"] = "refresh"


class SyncResponse(BaseModel):
    handle: str
    new_submissions: int
    total_submissions: int
    has_more: bool
    synced_at: datetime


class TopicCount(BaseModel):
    topic: str
    solved_count: int


class SolvedProblem(BaseModel):
    contest_id: int
    problem_index: str
    name: str
    rating: int | None
    tags: list[str]
    solved_at: datetime
    url: str


class SummaryResponse(BaseModel):
    handle: str
    rating: int | None
    rank: str | None
    avatar_url: str | None
    synced_at: datetime | None
    has_more: bool
    total_submissions: int
    solved_count: int
    topic_distribution: list[TopicCount]
    solved_problems: list[SolvedProblem]


class ScoreComponents(BaseModel):
    solve_rate: float
    difficulty: float | None
    efficiency: float
    recent_performance: float | None


class TopicAssessment(BaseModel):
    topic: str
    score: int | None = Field(ge=0, le=100)
    confidence: Literal["insufficient_data", "low", "medium", "high"]
    attempted_unique: int
    solved_unique: int
    rated_solved: int
    unrated_solved: int
    failed_attempts: int
    recent_attempted: int
    recent_solved: int
    average_solved_rating: int | None
    components: ScoreComponents
    effective_weights: dict[str, float]
    rationale: list[str]


class SkillAssessmentResponse(BaseModel):
    handle: str
    scoring_version: str
    evaluated_at: datetime
    recent_window_days: int
    history_complete: bool
    status: Literal["estimated", "insufficient_data"]
    topics: list[TopicAssessment]


class RecommendationContributions(BaseModel):
    topic: float
    difficulty: float
    prerequisites: float
    diversity: float


class ProblemRecommendation(BaseModel):
    contest_id: int
    problem_index: str
    name: str
    rating: int | None
    tags: list[str]
    solved_count: int | None
    url: str
    target_topic: str
    rank_score: float = Field(ge=0, le=100)
    contributions: RecommendationContributions
    rationale: list[str]


class RecommendationsResponse(BaseModel):
    handle: str
    version: str
    synced_at: datetime | None
    status: Literal["ready", "catalog_limited", "history_incomplete", "history_unverifiable"]
    target_rating: int | None
    target_rating_source: str | None
    cold_start: bool
    recommendations: list[ProblemRecommendation]


def _database_error(exc: SQLAlchemyError) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={"code": "database_unavailable", "message": "Database is unavailable"},
    )


@router.post("/sync", response_model=SyncResponse)
def sync_codeforces(
    request: SyncRequest,
    session: Annotated[Session, Depends(get_session)],
    client: Annotated[CodeforcesClient, Depends(get_codeforces_client)],
) -> dict:
    try:
        return sync_handle(session, client, request.handle, request.mode)
    except CodeforcesError as exc:
        session.rollback()
        raise HTTPException(
            status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}
        ) from exc
    except SQLAlchemyError as exc:
        session.rollback()
        raise _database_error(exc) from exc


@router.get("/users/{handle}/summary", response_model=SummaryResponse)
def codeforces_summary(
    handle: Annotated[str, Path(min_length=1, max_length=24, pattern=HANDLE_PATTERN.pattern)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    try:
        summary = get_summary(session, handle)
    except SQLAlchemyError as exc:
        raise _database_error(exc) from exc
    if summary is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_synced", "message": "This handle has not been synced yet"},
        )
    return summary


@router.get("/users/{handle}/skills", response_model=SkillAssessmentResponse)
def codeforces_skills(
    handle: Annotated[str, Path(min_length=1, max_length=24, pattern=HANDLE_PATTERN.pattern)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    try:
        assessment = get_skill_assessment(session, handle)
    except SQLAlchemyError as exc:
        raise _database_error(exc) from exc
    if assessment is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_synced", "message": "This handle has not been synced yet"},
        )
    return assessment


@router.get("/users/{handle}/recommendations", response_model=RecommendationsResponse)
def codeforces_recommendations(
    handle: Annotated[str, Path(min_length=1, max_length=24, pattern=HANDLE_PATTERN.pattern)],
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=5, le=10)] = 8,
) -> dict:
    try:
        recommendations = get_recommendations(session, handle, limit)
    except SQLAlchemyError as exc:
        raise _database_error(exc) from exc
    if recommendations is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_synced", "message": "This handle has not been synced yet"},
        )
    return recommendations
