from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_session
from app.models import CodeReview, Problem
from app.review_provider import ReviewProvider, ReviewProviderError, get_review_provider
from app.review_schemas import ReviewDetail, ReviewHistory, ReviewRequest, ReviewSummary

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _database_error(exc: SQLAlchemyError) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={"code": "database_unavailable", "message": "Database is unavailable"},
    )


def _detail(review: CodeReview) -> ReviewDetail:
    return ReviewDetail(
        id=review.id,
        language=review.language,
        code=review.source_code,
        problem_context=review.problem_context,
        contest_id=review.contest_id,
        problem_index=review.problem_index,
        problem_title=review.problem_title,
        feedback=review.feedback,
        provider=review.provider,
        model=review.model,
        created_at=review.created_at,
    )


@router.post("", response_model=ReviewDetail, status_code=201)
def create_review(
    request: ReviewRequest,
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    provider: Annotated[ReviewProvider, Depends(get_review_provider)],
) -> ReviewDetail:
    try:
        problem = None
        if request.contest_id is not None and request.problem_index is not None:
            problem = session.get(Problem, (request.contest_id, request.problem_index.upper()))
            if problem is None:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "code": "problem_not_found",
                        "message": "Stored Codeforces problem not found",
                    },
                )
        metadata = (
            {
                "contest_id": problem.contest_id,
                "index": problem.problem_index,
                "name": problem.name,
                "rating": problem.rating,
                "tags": problem.tags,
            }
            if problem else None
        )
        try:
            feedback = provider.review(request, metadata)
        except ReviewProviderError as exc:
            raise HTTPException(
                status_code=exc.status_code,
                detail={"code": exc.code, "message": exc.message},
            ) from exc
        review = CodeReview(
            id=uuid4(),
            user_id=user_id,
            language=request.language,
            source_code=request.code,
            problem_context=request.problem_context,
            contest_id=request.contest_id,
            problem_index=problem.problem_index if problem else None,
            problem_title=problem.name if problem else None,
            feedback=feedback.model_dump(),
            provider=provider.provider,
            model=provider.model,
        )
        session.add(review)
        session.commit()
        session.refresh(review)
        return _detail(review)
    except SQLAlchemyError as exc:
        session.rollback()
        raise _database_error(exc) from exc


@router.get("", response_model=ReviewHistory)
def list_reviews(
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> ReviewHistory:
    try:
        reviews = session.scalars(
            select(CodeReview).where(CodeReview.user_id == user_id)
            .order_by(CodeReview.created_at.desc(), CodeReview.id.desc())
            .limit(limit)
        ).all()
        return ReviewHistory(reviews=[ReviewSummary(
            id=review.id,
            language=review.language,
            problem_title=review.problem_title,
            created_at=review.created_at,
            approach_summary=review.feedback["approach_summary"],
        ) for review in reviews])
    except SQLAlchemyError as exc:
        raise _database_error(exc) from exc


@router.get("/{review_id}", response_model=ReviewDetail)
def get_review(
    review_id: UUID,
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ReviewDetail:
    try:
        review = session.get(CodeReview, review_id)
        if review is None or review.user_id != user_id:
            raise HTTPException(
                status_code=404,
                detail={"code": "review_not_found", "message": "Review not found"},
            )
        return _detail(review)
    except SQLAlchemyError as exc:
        raise _database_error(exc) from exc
