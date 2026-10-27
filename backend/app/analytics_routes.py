"""Authenticated analytics projected from the linked Codeforces account."""

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.analytics_engine import aggregate_daily, aggregate_period, utc_day
from app.auth import get_current_user
from app.challenge_tree import build_challenge_tree
from app.codeforces_service import get_recommendations, get_skill_assessment, get_summary
from app.database import get_session
from app.models import CodeforcesRatingChange, Problem, Submission
from app.platform_service import get_link

router = APIRouter(prefix="/analytics", tags=["analytics"])


class AnalyticsResponse(BaseModel):
    codeforces: dict | None
    kpis: dict
    timeline: list[dict]
    heatmap: list[dict]
    topics: list[dict]
    strengths: list[dict]
    weaknesses: list[dict]
    difficulty: list[dict]
    difficulty_progression: list[dict]
    rating_history: list[dict]
    recommendations: list[dict]
    roadmap: dict
    attempt_vs_accepted: dict
    recent_activity: list[dict]
    insights: list[dict]
    limitations: list[str]


@router.get("", response_model=AnalyticsResponse)
def analytics(
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    period: Annotated[Literal["daily", "weekly", "monthly"], Query()] = "daily",
) -> dict:
    try:
        return build_analytics(session, user_id, period)
    except SQLAlchemyError as exc:
        session.rollback()
        raise HTTPException(
            status_code=503,
            detail={"code": "database_unavailable", "message": "Analytics data is unavailable"},
        ) from exc


def build_analytics(session: Session, user_id: UUID, period: str = "daily") -> dict:
    link = get_link(session, user_id, "codeforces")
    summary = get_summary(session, link.username) if link else None
    assessment = get_skill_assessment(session, link.username) if link else None
    pairs = (
        session.execute(
            select(Submission, Problem)
            .outerjoin(
                Problem,
                (Submission.contest_id == Problem.contest_id)
                & (Submission.problem_index == Problem.problem_index),
            )
            .where(Submission.handle_key == link.username_key)
            .order_by(Submission.created_at)
        ).all()
        if link and summary
        else []
    )
    raw = (
        [
            {
                "created_at": row.created_at,
                "verdict": row.verdict,
                "contest_id": row.contest_id,
                "problem_index": row.problem_index,
            }
            for row, _ in pairs
        ]
        if summary
        else None
    )
    solved: dict[tuple[int, str], tuple[Submission, Problem | None]] = {}
    for row, problem in pairs:
        if row.verdict == "OK" and row.contest_id is not None:
            solved.setdefault((row.contest_id, row.problem_index), (row, problem))
    observed_since = None
    if summary and summary["has_more"]:
        observed_since = min(
            (utc_day(row.created_at) for row, _ in pairs),
            default=datetime.now(timezone.utc).date().isoformat(),
        )
    daily = aggregate_daily(
        raw,
        today=datetime.now(timezone.utc).date(),
        observed_since=datetime.fromisoformat(observed_since).date() if observed_since else None,
    )
    rating_rows = (
        session.scalars(
            select(CodeforcesRatingChange)
            .where(CodeforcesRatingChange.handle_key == link.username_key)
            .order_by(CodeforcesRatingChange.rated_at)
        ).all()
        if link
        else []
    )
    difficulty: Counter[str] = Counter()
    progression: dict[str, list[int]] = defaultdict(list)
    for row, problem in solved.values():
        rating = problem.rating if problem and problem.rating is not None else row.rating_at_import
        label = (
            "Unrated"
            if rating is None
            else (
                "<1200"
                if rating < 1200
                else "1200–1599"
                if rating < 1600
                else "1600–1999"
                if rating < 2000
                else "2000+"
            )
        )
        difficulty[label] += 1
        if rating is not None:
            progression[utc_day(row.created_at)].append(rating)
    tree = build_challenge_tree(session, user_id)
    assigned = {
        (challenge["contest_id"], challenge["problem_index"])
        for node in tree["nodes"]
        for challenge in node["challenges"]
    }
    recommendations = []
    if link and summary and not summary["has_more"]:
        ranked = get_recommendations(session, link.username, 20)
        if ranked:
            recommendations = [
                {**item, "category": "optional_practice"}
                for item in ranked["recommendations"]
                if (item["contest_id"], item["problem_index"]) not in assigned
            ][:8]
    topic_counts = (
        {item["topic"]: item["solved_count"] for item in summary["topic_distribution"]}
        if summary
        else {}
    )
    topics = [
        {
            "topic": item["topic"],
            "solved_count": topic_counts.get(item["topic"], 0),
            "score": item["score"],
            "confidence": item["confidence"],
        }
        for item in (assessment["topics"] if assessment else [])
    ]
    scored = sorted(
        [item for item in topics if item["score"] is not None],
        key=lambda item: item["score"],
        reverse=True,
    )
    insights = []
    if summary and summary["topic_distribution"]:
        first = summary["topic_distribution"][0]
        insights.append(
            {
                "kind": "most_practiced",
                "detail": (
                    f"{first['topic']} appears on {first['solved_count']} distinct solved problems."
                ),
            }
        )
    if scored:
        weakest = scored[-1]
        insights.append(
            {
                "kind": "focus",
                "detail": (
                    f"{weakest['topic']} has a {weakest['score']}/100 estimate "
                    f"({weakest['confidence']})."
                ),
            }
        )
    if tree["recommended_key"]:
        next_topic = next(item for item in tree["nodes"] if item["key"] == tree["recommended_key"])
        insights.append(
            {
                "kind": "next_topic",
                "detail": f"Study {next_topic['title']} next; its prerequisites are verified.",
            }
        )
    return {
        "codeforces": summary,
        "kpis": {
            "distinct_solves": len(solved) if summary else None,
            "submissions": len(pairs) if summary else None,
            "rating": summary["rating"] if summary else None,
            "recent_events": sum(row["submissions"] or 0 for row in daily[-7:])
            if summary
            else None,
            "streak_days": tree["streak_days"],
            "verified_challenges": tree["verified_challenges"],
        },
        "timeline": aggregate_period(daily, period),
        "heatmap": daily,
        "topics": topics,
        "strengths": scored[:3],
        "weaknesses": list(reversed(scored[-3:])),
        "difficulty": [
            {"difficulty": name, "count": difficulty[name]}
            for name in ("<1200", "1200–1599", "1600–1999", "2000+", "Unrated")
        ],
        "difficulty_progression": [
            {
                "date": day,
                "average_rating": round(sum(values) / len(values)),
                "solved_count": len(values),
            }
            for day, values in sorted(progression.items())
        ],
        "rating_history": [
            {
                "date": utc_day(row.rated_at),
                "contest": row.contest_name,
                "contest_id": row.contest_id,
                "rating": row.new_rating,
                "old_rating": row.old_rating,
                "change": row.new_rating - row.old_rating,
                "rank": row.rank,
            }
            for row in rating_rows
        ],
        "recommendations": recommendations,
        "roadmap": tree,
        "attempt_vs_accepted": {
            "submissions": len(pairs) if summary else None,
            "accepted_submissions": sum(row.verdict == "OK" for row, _ in pairs)
            if summary
            else None,
            "distinct_solves": len(solved) if summary else None,
        },
        "recent_activity": [
            {
                "occurred_at": row.created_at,
                "title": problem.name if problem else f"{row.contest_id or '?'}{row.problem_index}",
                "verdict": row.verdict,
            }
            for row, problem in reversed(pairs[-10:])
        ],
        "insights": insights,
        "limitations": ["History is still importing; older accepted problems may not be included."]
        if summary and summary["has_more"]
        else [],
    }
