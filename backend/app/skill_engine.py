"""Deterministic, versioned skill estimates from public submission evidence."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

SCORING_VERSION = "1.0"
RECENT_DAYS = 90
MIN_ATTEMPTED = 5
MIN_SOLVED = 3
MIN_RATED_SOLVED = 2
BASE_WEIGHTS = {
    "solve_rate": 0.40,
    "difficulty": 0.25,
    "efficiency": 0.15,
    "recent_performance": 0.20,
}
FAILED_VERDICTS = {
    "FAILED",
    "PARTIAL",
    "COMPILATION_ERROR",
    "RUNTIME_ERROR",
    "WRONG_ANSWER",
    "TIME_LIMIT_EXCEEDED",
    "MEMORY_LIMIT_EXCEEDED",
    "IDLENESS_LIMIT_EXCEEDED",
    "SECURITY_VIOLATED",
    "CRASHED",
    "INPUT_PREPARATION_CRASHED",
    "CHALLENGED",
    "REJECTED",
}


@dataclass(frozen=True)
class Attempt:
    submission_id: int
    problem_key: tuple[int, str]
    tags: tuple[str, ...]
    rating: int | None
    verdict: str | None
    submitted_at: datetime


@dataclass
class ProblemEvidence:
    tags: set[str]
    rating: int | None
    first_solved_at: datetime | None
    failed_attempts: int
    recent_attempted: bool


def _utc(value: datetime) -> datetime:
    return (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _problem_evidence(
    attempts: list[Attempt], cutoff: datetime
) -> dict[tuple[int, str], ProblemEvidence]:
    grouped: dict[tuple[int, str], list[Attempt]] = defaultdict(list)
    for attempt in attempts:
        if attempt.verdict == "OK" or attempt.verdict in FAILED_VERDICTS:
            grouped[attempt.problem_key].append(attempt)

    evidence = {}
    for key, rows in grouped.items():
        rows.sort(key=lambda row: (_utc(row.submitted_at), row.submission_id))
        first_solve = next((row for row in rows if row.verdict == "OK"), None)
        first_solved_at = _utc(first_solve.submitted_at) if first_solve else None
        first_solve_order = (
            (_utc(first_solve.submitted_at), first_solve.submission_id) if first_solve else None
        )
        failed = sum(
            row.verdict in FAILED_VERDICTS
            and (
                first_solve_order is None
                or (_utc(row.submitted_at), row.submission_id) < first_solve_order
            )
            for row in rows
        )
        tags = {tag for row in rows for tag in row.tags if tag}
        rating = next((row.rating for row in reversed(rows) if row.rating is not None), None)
        evidence[key] = ProblemEvidence(
            tags=tags,
            rating=rating,
            first_solved_at=first_solved_at,
            failed_attempts=failed,
            recent_attempted=any(_utc(row.submitted_at) >= cutoff for row in rows),
        )
    return evidence


def assess_topics(
    attempts: list[Attempt],
    *,
    evaluated_at: datetime,
    history_complete: bool,
) -> list[dict]:
    """Return one estimate per tagged topic; insufficient evidence yields a null score."""
    cutoff = _utc(evaluated_at) - timedelta(days=RECENT_DAYS)
    by_topic: dict[str, list[ProblemEvidence]] = defaultdict(list)
    for evidence in _problem_evidence(attempts, cutoff).values():
        for topic in evidence.tags:
            by_topic[topic].append(evidence)

    results = []
    for topic, problems in sorted(by_topic.items()):
        attempted = len(problems)
        solved = [problem for problem in problems if problem.first_solved_at is not None]
        rated_solved = [problem.rating for problem in solved if problem.rating is not None]
        recent_attempted = sum(problem.recent_attempted for problem in problems)
        recent_solved = sum(
            problem.first_solved_at is not None and problem.first_solved_at >= cutoff
            for problem in problems
        )
        failures = sum(problem.failed_attempts for problem in problems)
        capped_failures = sum(min(problem.failed_attempts, 3) for problem in problems)
        average_rating = sum(rated_solved) / len(rated_solved) if rated_solved else None

        raw_components = {
            "solve_rate": len(solved) / attempted,
            "difficulty": (
                sum(_clamp((rating - 800) / 2400) for rating in rated_solved) / len(rated_solved)
                if rated_solved
                else None
            ),
            "efficiency": 1 - capped_failures / (3 * attempted),
            "recent_performance": (recent_solved / recent_attempted if recent_attempted else None),
        }
        available_weight = sum(
            BASE_WEIGHTS[name] for name, value in raw_components.items() if value is not None
        )
        weights = {
            name: round(BASE_WEIGHTS[name] / available_weight, 4)
            for name, value in raw_components.items()
            if value is not None
        }
        enough = (
            attempted >= MIN_ATTEMPTED
            and len(solved) >= MIN_SOLVED
            and len(rated_solved) >= MIN_RATED_SOLVED
        )
        score = (
            round(
                100
                * sum(
                    BASE_WEIGHTS[name] * value
                    for name, value in raw_components.items()
                    if value is not None
                )
                / available_weight
            )
            if enough and history_complete
            else None
        )
        confidence: Literal["insufficient_data", "low", "medium", "high"]
        if score is None:
            confidence = "insufficient_data"
        elif attempted >= 25 and len(rated_solved) >= 10 and recent_attempted >= 5:
            confidence = "high"
        elif attempted >= 10 and len(rated_solved) >= 5 and recent_attempted >= 3:
            confidence = "medium"
        else:
            confidence = "low"

        rationale = [
            f"{len(solved)} distinct solves out of {attempted} distinct attempted problems.",
            f"{failures} observable failed attempts before acceptance or on unsolved problems; "
            "at most 3 per problem affect efficiency.",
            f"{recent_solved} new solves among {recent_attempted} problems attempted "
            f"in the last {RECENT_DAYS} days.",
        ]
        if rated_solved:
            rationale.append(
                f"{len(rated_solved)} rated solves contribute difficulty, normalized from "
                "Codeforces ratings 800–3200."
            )
        else:
            rationale.append("No rated solves; difficulty weight is omitted and redistributed.")
        if not recent_attempted:
            rationale.append(
                "No recent attempts; recent-performance weight is omitted and redistributed."
            )
        if not history_complete:
            rationale.append(
                "Older submission pages remain; no score is published until import completes."
            )
        elif not enough:
            rationale.append(
                f"Need at least {MIN_ATTEMPTED} distinct attempts, {MIN_SOLVED} distinct "
                f"solves, and {MIN_RATED_SOLVED} rated solves before publishing an estimate."
            )
        else:
            rationale.append(
                "Normalized 0–100 estimate from available weighted components; "
                "it is not an exact measure of skill."
            )

        results.append(
            {
                "topic": topic,
                "score": score,
                "confidence": confidence,
                "attempted_unique": attempted,
                "solved_unique": len(solved),
                "rated_solved": len(rated_solved),
                "unrated_solved": len(solved) - len(rated_solved),
                "failed_attempts": failures,
                "recent_attempted": recent_attempted,
                "recent_solved": recent_solved,
                "average_solved_rating": round(average_rating)
                if average_rating is not None
                else None,
                "components": {
                    name: round(value, 4) if value is not None else None
                    for name, value in raw_components.items()
                },
                "effective_weights": weights,
                "rationale": rationale,
            }
        )
    return results
