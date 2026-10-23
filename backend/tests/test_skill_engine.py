from datetime import datetime, timedelta, timezone

from app.skill_engine import Attempt, assess_topics

NOW = datetime(2026, 10, 24, tzinfo=timezone.utc)


def attempt(
    submission_id: int,
    problem: str,
    verdict: str,
    *,
    rating: int | None = 1200,
    days_ago: int = 5,
    tags: tuple[str, ...] = ("dp",),
) -> Attempt:
    return Attempt(
        submission_id=submission_id,
        problem_key=(100, problem),
        tags=tags,
        rating=rating,
        verdict=verdict,
        submitted_at=NOW - timedelta(days=days_ago, minutes=100 - submission_id),
    )


def score(rows: list[Attempt], complete: bool = True):
    return assess_topics(rows, evaluated_at=NOW, history_complete=complete)


def test_empty_history_has_no_topic_scores():
    assert score([]) == []


def test_repeated_attempts_do_not_inflate_unique_solved_count():
    rows = [
        attempt(1, "A", "WRONG_ANSWER"),
        attempt(2, "A", "WRONG_ANSWER"),
        attempt(3, "A", "OK"),
        attempt(4, "A", "RUNTIME_ERROR"),
        attempt(5, "A", "OK"),
        attempt(6, "B", "OK"),
        attempt(7, "C", "OK"),
        attempt(8, "D", "WRONG_ANSWER"),
        attempt(9, "E", "WRONG_ANSWER"),
    ]
    result = score(rows)[0]
    assert result["attempted_unique"] == 5
    assert result["solved_unique"] == 3
    assert result["failed_attempts"] == 4
    assert result["components"]["efficiency"] == round(1 - 4 / 15, 4)
    assert result["score"] is not None


def test_sparse_history_withholds_score_but_returns_evidence():
    result = score([attempt(1, "A", "OK"), attempt(2, "B", "WRONG_ANSWER")])[0]
    assert result["score"] is None
    assert result["confidence"] == "insufficient_data"
    assert result["attempted_unique"] == 2
    assert any("Need at least 5" in line for line in result["rationale"])


def test_mixed_ratings_and_old_history_redistribute_missing_recent_weight():
    rows = [
        attempt(1, "A", "OK", rating=1200, days_ago=200),
        attempt(2, "B", "OK", rating=2000, days_ago=200),
        attempt(3, "C", "OK", rating=None, days_ago=200),
        attempt(4, "D", "WRONG_ANSWER", rating=None, days_ago=200),
        attempt(5, "E", "WRONG_ANSWER", rating=800, days_ago=200),
    ]
    result = score(rows)[0]
    assert result["rated_solved"] == 2
    assert result["unrated_solved"] == 1
    assert result["average_solved_rating"] == 1600
    assert result["components"]["difficulty"] == round((1 / 6 + 1 / 2) / 2, 4)
    assert result["components"]["recent_performance"] is None
    assert "recent_performance" not in result["effective_weights"]
    assert result["confidence"] == "low"


def test_normal_case_has_explainable_normalized_score():
    rows = [
        attempt(1, "A", "OK", rating=1200),
        attempt(2, "B", "OK", rating=1600),
        attempt(3, "C", "OK", rating=2000),
        attempt(4, "D", "WRONG_ANSWER", rating=None),
        attempt(5, "E", "WRONG_ANSWER", rating=800),
    ]
    result = score(rows)[0]
    assert result["components"] == {
        "solve_rate": 0.6,
        "difficulty": round((1 / 6 + 1 / 3 + 1 / 2) / 3, 4),
        "efficiency": round(1 - 2 / 15, 4),
        "recent_performance": 0.6,
    }
    assert result["score"] == 57
    assert result["confidence"] == "low"
    assert 0 <= result["score"] <= 100
    assert any("not an exact measure" in line for line in result["rationale"])


def test_incomplete_import_never_publishes_score():
    rows = [attempt(index, str(index), "OK") for index in range(1, 7)]
    result = score(rows, complete=False)[0]
    assert result["score"] is None
    assert result["confidence"] == "insufficient_data"
    assert any("Older submission pages remain" in line for line in result["rationale"])


def test_unrated_history_omits_difficulty_and_withholds_score():
    rows = [attempt(index, str(index), "OK", rating=None) for index in range(1, 6)]
    result = score(rows)[0]
    assert result["components"]["difficulty"] is None
    assert result["rated_solved"] == 0
    assert result["score"] is None
    assert result["confidence"] == "insufficient_data"
