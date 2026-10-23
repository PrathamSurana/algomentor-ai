from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.codeforces import CodeforcesClient, CodeforcesError
from app.models import CodeforcesUser, Problem, Submission

PAGE_SIZE = 1000
MAX_PAGES_PER_SYNC = 5
CATALOG_TTL = timedelta(hours=24)


def _insert_for(session: Session, model: type):
    dialect = session.bind.dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:
        raise RuntimeError(f"Unsupported database dialect: {dialect}")
    return insert(model)


def _chunks(rows: list[dict], size: int = 200):
    for index in range(0, len(rows), size):
        yield rows[index : index + size]


def _upsert(
    session: Session, model: type, rows: list[dict], keys: list[str], update: list[str]
) -> None:
    for chunk in _chunks(rows):
        statement = _insert_for(session, model).values(chunk)
        if update:
            statement = statement.on_conflict_do_update(
                index_elements=keys,
                set_={field: getattr(statement.excluded, field) for field in update},
            )
        else:
            statement = statement.on_conflict_do_nothing(index_elements=keys)
        session.execute(statement)


def _problem(raw: dict[str, Any], now: datetime, solved_count: int | None = None) -> dict | None:
    contest_id = raw.get("contestId")
    index = raw.get("index")
    if not isinstance(contest_id, int) or not isinstance(index, str) or not index:
        return None
    tags = raw.get("tags", [])
    return {
        "contest_id": contest_id,
        "problem_index": index,
        "name": str(raw.get("name", f"{contest_id}{index}"))[:300],
        "rating": raw.get("rating") if isinstance(raw.get("rating"), int) else None,
        "tags": [tag for tag in tags if isinstance(tag, str)] if isinstance(tags, list) else [],
        "solved_count": solved_count,
        "updated_at": now,
    }


def sync_handle(session: Session, client: CodeforcesClient, handle: str, mode: str) -> dict:
    profile = client.profile(handle)
    canonical = profile.get("handle")
    if not isinstance(canonical, str) or not canonical:
        raise CodeforcesError("codeforces_bad_response", "Profile is missing a handle")
    key = canonical.lower()
    now = datetime.now(timezone.utc)
    user = session.get(CodeforcesUser, key)
    if mode == "continue" and (user is None or user.next_from is None):
        raise CodeforcesError("nothing_to_continue", "No older pages remain to import", 409)

    latest_catalog = session.scalar(select(func.max(Problem.updated_at)))
    if latest_catalog and latest_catalog.tzinfo is None:
        latest_catalog = latest_catalog.replace(tzinfo=timezone.utc)
    refresh_catalog = latest_catalog is None or now - latest_catalog > CATALOG_TTL
    catalog = client.problemset() if refresh_catalog else None

    start = user.next_from if mode == "continue" and user else 1
    page_rows: list[dict] = []
    next_from: int | None = None
    for _ in range(MAX_PAGES_PER_SYNC):
        page = client.submissions(canonical, start, PAGE_SIZE)
        page_rows.extend(page)
        if len(page) < PAGE_SIZE:
            next_from = None
            break
        start += PAGE_SIZE
        next_from = start

    if user is None:
        user = CodeforcesUser(handle_key=key, handle=canonical)
        session.add(user)
    user.handle = canonical
    user.rating = profile.get("rating") if isinstance(profile.get("rating"), int) else None
    user.rank = str(profile["rank"])[:40] if profile.get("rank") else None
    user.avatar_url = str(profile["avatar"])[:500] if profile.get("avatar") else None
    user.synced_at = now
    user.next_from = next_from
    session.flush()

    problem_rows: dict[tuple[int, str], dict] = {}
    submission_rows: dict[int, dict] = {}
    for raw in page_rows:
        problem = raw.get("problem")
        if not isinstance(problem, dict):
            continue
        normalized = _problem(problem, now)
        if normalized:
            problem_rows[(normalized["contest_id"], normalized["problem_index"])] = normalized
        submission_id = raw.get("id")
        timestamp = raw.get("creationTimeSeconds")
        if not isinstance(submission_id, int) or not isinstance(timestamp, int):
            continue
        submission_rows[submission_id] = {
            "submission_id": submission_id,
            "handle_key": key,
            "contest_id": normalized["contest_id"] if normalized else None,
            "problem_index": str(problem.get("index", ""))[:10],
            "verdict": str(raw["verdict"])[:40] if raw.get("verdict") else None,
            "created_at": datetime.fromtimestamp(timestamp, timezone.utc),
            "rating_at_import": normalized["rating"] if normalized else None,
            "tags_at_import": normalized["tags"] if normalized else [],
        }

    before = (
        session.scalar(
            select(func.count()).select_from(Submission).where(Submission.handle_key == key)
        )
        or 0
    )
    _upsert(session, Problem, list(problem_rows.values()), ["contest_id", "problem_index"], [])
    _upsert(
        session,
        Submission,
        list(submission_rows.values()),
        ["handle_key", "submission_id"],
        ["verdict", "rating_at_import", "tags_at_import"],
    )
    if catalog:
        statistics = {
            (item.get("contestId"), item.get("index")): item.get("solvedCount")
            for item in catalog.get("problemStatistics", [])
            if isinstance(item, dict)
        }
        catalog_rows = {}
        for raw in catalog["problems"]:
            if not isinstance(raw, dict):
                continue
            row = _problem(raw, now, statistics.get((raw.get("contestId"), raw.get("index"))))
            if row:
                catalog_rows[(row["contest_id"], row["problem_index"])] = row
        _upsert(
            session,
            Problem,
            list(catalog_rows.values()),
            ["contest_id", "problem_index"],
            ["name", "rating", "tags", "solved_count", "updated_at"],
        )
    session.commit()
    after = (
        session.scalar(
            select(func.count()).select_from(Submission).where(Submission.handle_key == key)
        )
        or 0
    )
    return {
        "handle": canonical,
        "new_submissions": after - before,
        "total_submissions": after,
        "has_more": next_from is not None,
        "synced_at": now,
    }


def get_summary(session: Session, handle: str) -> dict | None:
    user = session.get(CodeforcesUser, handle.lower())
    if user is None:
        return None
    total_submissions = (
        session.scalar(
            select(func.count())
            .select_from(Submission)
            .where(Submission.handle_key == user.handle_key)
        )
        or 0
    )
    rows = session.execute(
        select(Submission, Problem)
        .outerjoin(
            Problem,
            and_(
                Submission.contest_id == Problem.contest_id,
                Submission.problem_index == Problem.problem_index,
            ),
        )
        .where(Submission.handle_key == user.handle_key, Submission.verdict == "OK")
        .order_by(Submission.created_at.desc())
    ).all()
    solved: dict[tuple[int, str], dict] = {}
    topics: Counter[str] = Counter()
    for submission, problem in rows:
        if submission.contest_id is None:
            continue
        problem_key = (submission.contest_id, submission.problem_index)
        if problem_key in solved:
            continue
        tags = problem.tags if problem else submission.tags_at_import
        for tag in set(tags or []):
            topics[tag] += 1
        solved[problem_key] = {
            "contest_id": submission.contest_id,
            "problem_index": submission.problem_index,
            "name": problem.name
            if problem
            else f"{submission.contest_id}{submission.problem_index}",
            "rating": problem.rating if problem else submission.rating_at_import,
            "tags": tags or [],
            "solved_at": submission.created_at,
            "url": f"https://codeforces.com/problemset/problem/{submission.contest_id}/{submission.problem_index}",
        }
    return {
        "handle": user.handle,
        "rating": user.rating,
        "rank": user.rank,
        "avatar_url": user.avatar_url,
        "synced_at": user.synced_at,
        "has_more": user.next_from is not None,
        "total_submissions": total_submissions,
        "solved_count": len(solved),
        "topic_distribution": [
            {"topic": topic, "solved_count": count}
            for topic, count in sorted(topics.items(), key=lambda item: (-item[1], item[0]))
        ],
        "solved_problems": list(solved.values())[:100],
    }
