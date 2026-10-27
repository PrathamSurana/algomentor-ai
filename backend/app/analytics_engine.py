"""UTC-aware Codeforces activity aggregation with distinct accepted solves."""

from collections import Counter
from datetime import date, datetime, timedelta, timezone


def utc_day(value: datetime) -> str:
    aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return aware.astimezone(timezone.utc).date().isoformat()


def aggregate_daily(
    submissions: list[dict] | None,
    *,
    today: date,
    days: int = 365,
    observed_since: date | None = None,
) -> list[dict]:
    events: Counter[str] = Counter()
    accepted_events: Counter[str] = Counter()
    first_solves: dict[tuple[int, str], str] = {}
    for item in submissions or []:
        day = utc_day(item["created_at"])
        events[day] += 1
        if item["verdict"] == "OK":
            accepted_events[day] += 1
            if item["contest_id"] is not None:
                key = (item["contest_id"], item["problem_index"])
                if key not in first_solves or day < first_solves[key]:
                    first_solves[key] = day
    solves: Counter[str] = Counter(first_solves.values())
    start = today - timedelta(days=days - 1)
    cumulative = sum(day < start.isoformat() for day in first_solves.values())
    result = []
    for offset in range(days):
        day = (start + timedelta(days=offset)).isoformat()
        cumulative += solves[day]
        observed = submissions is not None and (
            observed_since is None or day >= observed_since.isoformat()
        )
        result.append(
            {
                "date": day,
                "submissions": events[day] if observed else None,
                "accepted_submissions": accepted_events[day] if observed else None,
                "new_solves": solves[day] if observed else None,
                "cumulative_solves": cumulative if observed else None,
            }
        )
    return result


def aggregate_period(rows: list[dict], period: str) -> list[dict]:
    if period == "daily":
        return rows
    buckets: dict[str, dict] = {}
    for row in rows:
        parsed = date.fromisoformat(row["date"])
        key = (
            (parsed - timedelta(days=parsed.weekday())).isoformat()
            if period == "weekly"
            else parsed.strftime("%Y-%m")
        )
        bucket = buckets.setdefault(
            key,
            {
                "period": key,
                "submissions": None,
                "accepted_submissions": None,
                "new_solves": None,
                "cumulative_solves": None,
            },
        )
        for field in ("submissions", "accepted_submissions", "new_solves"):
            if row[field] is not None:
                bucket[field] = (bucket[field] or 0) + row[field]
        bucket["cumulative_solves"] = row["cumulative_solves"]
    return list(buckets.values())
