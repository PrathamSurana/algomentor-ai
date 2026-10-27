from datetime import date, datetime, timedelta, timezone

from app.analytics_engine import aggregate_daily, aggregate_period


def test_utc_boundary_and_repeated_accepted_problem_count_once():
    local = timezone(timedelta(hours=5, minutes=30))
    rows = [
        {
            "created_at": datetime(2026, 10, 27, 0, 15, tzinfo=local),
            "verdict": "OK",
            "contest_id": 100,
            "problem_index": "A",
        },
        {
            "created_at": datetime(2026, 10, 27, 8, 0, tzinfo=local),
            "verdict": "OK",
            "contest_id": 100,
            "problem_index": "A",
        },
    ]
    daily = aggregate_daily(rows, today=date(2026, 10, 27), days=3)
    assert daily[0]["date"] == "2026-10-25"
    assert daily[1]["date"] == "2026-10-26"
    assert daily[1]["new_solves"] == 1
    assert daily[2]["date"] == "2026-10-27"
    assert daily[2]["accepted_submissions"] == 1
    assert daily[2]["new_solves"] == 0
    assert daily[2]["cumulative_solves"] == 1
    weekly = aggregate_period(daily, "weekly")
    assert sum(row["new_solves"] for row in weekly) == 1


def test_incomplete_history_does_not_mark_unobserved_dates_as_zero():
    rows = [
        {
            "created_at": datetime(2026, 10, 26, 12, tzinfo=timezone.utc),
            "verdict": "WRONG_ANSWER",
            "contest_id": 100,
            "problem_index": "A",
        }
    ]
    daily = aggregate_daily(
        rows, today=date(2026, 10, 27), days=4, observed_since=date(2026, 10, 26)
    )
    assert daily[0]["submissions"] is None
    assert daily[1]["cumulative_solves"] is None
    assert daily[2]["submissions"] == 1
    assert daily[3]["submissions"] == 0
    assert aggregate_period(daily, "weekly")[0]["new_solves"] is None
