"""Verified Codeforces challenge graph, backed only by stored public API data."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, text, tuple_
from sqlalchemy.orm import Session

from app.models import Problem, RoadmapChallenge, Submission
from app.platform_service import get_link

TIERS = ("beginner", "intermediate", "advanced")


@dataclass(frozen=True)
class Topic:
    key: str
    title: str
    prerequisites: tuple[str, ...]
    codeforces_tag: str
    pathway: str


TOPICS = (
    Topic("implementation", "Basic Implementation", (), "implementation", "Foundations"),
    Topic("arrays", "Arrays", ("implementation",), "implementation", "Foundations"),
    Topic("strings", "Strings", ("implementation",), "strings", "Foundations"),
    Topic("math_basics", "Mathematics Basics", ("implementation",), "math", "Foundations"),
    Topic("sorting", "Sorting", ("arrays",), "sortings", "Foundations"),
    Topic("hashing", "Hashing", ("arrays",), "data structures", "Core DSA"),
    Topic("two_pointers", "Two Pointers", ("arrays", "hashing"), "two pointers", "Core DSA"),
    Topic("prefix_sums", "Prefix Sums", ("arrays",), "implementation", "Core DSA"),
    Topic("sliding_window", "Sliding Window", ("prefix_sums",), "two pointers", "Core DSA"),
    Topic("binary_search", "Binary Search", ("sorting",), "binary search", "Core DSA"),
    Topic("stacks", "Stacks", ("arrays",), "data structures", "Core DSA"),
    Topic("queues", "Queues", ("arrays",), "data structures", "Core DSA"),
    Topic("linked_lists", "Linked Lists", ("arrays",), "data structures", "Core DSA"),
    Topic("recursion", "Recursion", ("implementation",), "dfs and similar", "Core DSA"),
    Topic("backtracking", "Backtracking", ("recursion",), "brute force", "Core DSA"),
    Topic("greedy", "Greedy Algorithms", ("sorting",), "greedy", "Techniques"),
    Topic("bitmasks", "Bit Manipulation", ("math_basics",), "bitmasks", "Techniques"),
    Topic("number_theory", "Number Theory", ("math_basics",), "number theory", "Techniques"),
    Topic(
        "sieve", "Sieve and Prime Factorization", ("number_theory",), "number theory", "Techniques"
    ),
    Topic("combinatorics", "Combinatorics", ("math_basics",), "combinatorics", "Techniques"),
    Topic("dp", "Dynamic Programming", ("recursion",), "dp", "Techniques"),
    Topic("trees", "Trees", ("recursion",), "trees", "Trees and Graphs"),
    Topic("bst", "Binary Search Trees", ("trees", "binary_search"), "trees", "Trees and Graphs"),
    Topic("heaps", "Heaps / Priority Queues", ("trees",), "data structures", "Trees and Graphs"),
    Topic(
        "graph_representation", "Graph Representation", ("arrays",), "graphs", "Trees and Graphs"
    ),
    Topic(
        "dfs", "DFS", ("graph_representation", "recursion"), "dfs and similar", "Trees and Graphs"
    ),
    Topic("bfs", "BFS", ("graph_representation", "queues"), "dfs and similar", "Trees and Graphs"),
    Topic("topological_sort", "Topological Sorting", ("dfs",), "graphs", "Trees and Graphs"),
    Topic("shortest_paths", "Shortest Paths", ("bfs", "dfs"), "shortest paths", "Trees and Graphs"),
    Topic("dsu", "Disjoint Set Union", ("graph_representation",), "dsu", "Trees and Graphs"),
    Topic(
        "mst",
        "Minimum Spanning Trees",
        ("graph_representation", "sorting"),
        "graphs",
        "Trees and Graphs",
    ),
    Topic(
        "segment_trees", "Segment Trees", ("trees", "prefix_sums"), "data structures", "Advanced CP"
    ),
    Topic("fenwick_trees", "Fenwick Trees", ("prefix_sums",), "data structures", "Advanced CP"),
    Topic("tries", "Tries", ("trees", "strings"), "strings", "Advanced CP"),
    Topic("advanced_dp", "Advanced Dynamic Programming", ("dp",), "dp", "Advanced CP"),
    Topic("binary_lifting", "Binary Lifting", ("trees",), "trees", "Advanced CP"),
    Topic(
        "string_algorithms",
        "String Algorithms",
        ("strings",),
        "string suffix structures",
        "Advanced CP",
    ),
    Topic(
        "advanced_graphs",
        "Advanced Graph Algorithms",
        ("shortest_paths", "dsu"),
        "graphs",
        "Advanced CP",
    ),
)


def validate_topics(topics: tuple[Topic, ...]) -> None:
    by_key = {topic.key: topic for topic in topics}
    if len(by_key) != len(topics):
        raise ValueError("Duplicate roadmap topic")
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(key: str) -> None:
        if key in visiting:
            raise ValueError("Roadmap prerequisites contain a cycle")
        if key in visited:
            return
        visiting.add(key)
        for parent in by_key[key].prerequisites:
            if parent not in by_key:
                raise ValueError(f"Unknown prerequisite: {parent}")
            visit(parent)
        visiting.remove(key)
        visited.add(key)

    for topic in topics:
        visit(topic.key)


validate_topics(TOPICS)


def problem_url(contest_id: int, index: str) -> str:
    if contest_id >= 100000:
        return f"https://codeforces.com/gym/{contest_id}/problem/{index}"
    return f"https://codeforces.com/problemset/problem/{contest_id}/{index}"


def _assign_challenges(
    session: Session,
    user_id: UUID,
    catalog: list[Problem],
    rating: int | None,
    assigned: list[RoadmapChallenge],
) -> list[RoadmapChallenge]:
    slots = {(row.topic_key, row.tier) for row in assigned}
    used = {(row.contest_id, row.problem_index) for row in assigned}
    base = max(800, min(1800, (rating or 1200) - 300))
    targets = {"beginner": base, "intermediate": base + 400, "advanced": base + 800}
    for topic in TOPICS:
        candidates = [
            problem
            for problem in catalog
            if topic.codeforces_tag in (problem.tags or [])
            and problem.rating is not None
            and problem.name
        ]
        for tier in TIERS:
            if (topic.key, tier) in slots:
                continue
            available = [
                problem
                for problem in candidates
                if (problem.contest_id, problem.problem_index) not in used
            ]
            if not available:
                continue
            chosen = min(
                available,
                key=lambda item: (
                    abs(item.rating - targets[tier]),
                    -(item.solved_count or 0),
                    item.contest_id,
                    item.problem_index,
                ),
            )
            row = RoadmapChallenge(
                user_id=user_id,
                topic_key=topic.key,
                tier=tier,
                contest_id=chosen.contest_id,
                problem_index=chosen.problem_index,
            )
            session.add(row)
            assigned.append(row)
            used.add((chosen.contest_id, chosen.problem_index))
    session.commit()
    return assigned


def _candidate_catalog(session: Session, rating: int | None) -> list[Problem]:
    """Fetch a small rated candidate pool, instead of transferring the entire catalog."""
    if session.bind.dialect.name != "postgresql":
        return session.scalars(select(Problem)).all()
    base = max(800, min(1800, (rating or 1200) - 300))
    tags = sorted({topic.codeforces_tag for topic in TOPICS})
    keys = session.execute(
        text("""
            WITH ranked AS (
                SELECT p.contest_id, p.problem_index,
                       row_number() OVER (
                           PARTITION BY t.tag, target.tier
                           ORDER BY abs(p.rating - target.rating),
                                    coalesce(p.solved_count, 0) DESC,
                                    p.contest_id, p.problem_index
                       ) AS position
                FROM codeforces_problems AS p
                JOIN unnest(CAST(:tags AS text[])) AS t(tag) ON p.tags ? t.tag
                CROSS JOIN (VALUES
                    ('beginner', :beginner),
                    ('intermediate', :intermediate),
                    ('advanced', :advanced)
                ) AS target(tier, rating)
                WHERE p.rating IS NOT NULL AND p.name <> ''
            )
            SELECT DISTINCT contest_id, problem_index
            FROM ranked WHERE position <= 16
        """),
        {
            "tags": tags,
            "beginner": base,
            "intermediate": base + 400,
            "advanced": base + 800,
        },
    ).all()
    if not keys:
        return []
    return session.scalars(
        select(Problem).where(tuple_(Problem.contest_id, Problem.problem_index).in_(keys))
    ).all()


def build_challenge_tree(session: Session, user_id: UUID) -> dict:
    link = get_link(session, user_id, "codeforces")
    assignments = (
        session.scalars(
            select(RoadmapChallenge).where(RoadmapChallenge.user_id == user_id)
        ).all()
        if link
        else []
    )
    profile_rating = None
    if link:
        from app.models import CodeforcesUser

        profile = session.get(CodeforcesUser, link.username_key)
        profile_rating = profile.rating if profile else None
    if link and len(assignments) < len(TOPICS) * len(TIERS):
        candidates = _candidate_catalog(session, profile_rating)
        assignments = _assign_challenges(
            session, user_id, candidates, profile_rating, assignments
        )
    keys = {(row.contest_id, row.problem_index) for row in assignments}
    catalog = (
        session.scalars(
            select(Problem).where(tuple_(Problem.contest_id, Problem.problem_index).in_(keys))
        ).all()
        if keys
        else []
    )
    catalog_by_key = {(row.contest_id, row.problem_index): row for row in catalog}
    accepted: dict[tuple[int, str], datetime] = {}
    if link:
        rows = session.scalars(
            select(Submission).where(
                Submission.handle_key == link.username_key,
                Submission.verdict == "OK",
                Submission.contest_id.is_not(None),
            )
        ).all()
        for row in rows:
            key = (row.contest_id, row.problem_index)
            if key not in accepted or row.created_at < accepted[key]:
                accepted[key] = row.created_at
    by_topic: dict[str, list[dict]] = defaultdict(list)
    for assignment in assignments:
        problem = catalog_by_key.get((assignment.contest_id, assignment.problem_index))
        if not problem:
            continue
        solved_at = accepted.get((assignment.contest_id, assignment.problem_index))
        by_topic[assignment.topic_key].append(
            {
                "tier": assignment.tier,
                "contest_id": problem.contest_id,
                "problem_index": problem.problem_index,
                "title": problem.name,
                "rating": problem.rating,
                "tags": problem.tags,
                "url": problem_url(problem.contest_id, problem.problem_index),
                "verified": solved_at is not None,
                "solved_at": solved_at,
                "required": True,
            }
        )
    completed = {
        topic.key
        for topic in TOPICS
        if len(by_topic[topic.key]) == len(TIERS)
        and all(challenge["verified"] for challenge in by_topic[topic.key])
    }
    nodes = []
    for topic in TOPICS:
        challenges = sorted(by_topic[topic.key], key=lambda item: TIERS.index(item["tier"]))
        missing = [parent for parent in topic.prerequisites if parent not in completed]
        state = "completed" if topic.key in completed else "locked" if missing else "ready"
        verified = sum(item["verified"] for item in challenges)
        dates = [item["solved_at"] for item in challenges if item["solved_at"]]
        nodes.append(
            {
                "key": topic.key,
                "title": topic.title,
                "pathway": topic.pathway,
                "prerequisites": list(topic.prerequisites),
                "missing_prerequisites": missing,
                "codeforces_tag": topic.codeforces_tag,
                "state": state,
                "verified_count": verified,
                "required_count": len(TIERS),
                "xp": verified * 100,
                "rank": TIERS[min(verified - 1, 2)] if verified else "unranked",
                "completed_at": max(dates) if state == "completed" and dates else None,
                "challenges": challenges,
            }
        )
    now = datetime.now(timezone.utc).date()
    solve_days = {
        (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value)
        .astimezone(timezone.utc)
        .date()
        for value in accepted.values()
        if value is not None
    }
    streak = 0
    cursor = now if now in solve_days else now - timedelta(days=1)
    while cursor in solve_days:
        streak += 1
        cursor -= timedelta(days=1)
    recommended = next((item["key"] for item in nodes if item["state"] == "ready"), None)
    return {
        "handle": link.username if link else None,
        "synced_at": link.synced_at if link else None,
        "sync_status": link.sync_status if link else "unlinked",
        "nodes": nodes,
        "completed_count": len(completed),
        "total_count": len(TOPICS),
        "verified_challenges": sum(item["verified_count"] for item in nodes),
        "xp": sum(item["xp"] for item in nodes),
        "streak_days": streak,
        "recommended_key": recommended,
        "achievements": [
            {"key": f"topics_{threshold}", "title": f"{threshold} topics completed"}
            for threshold in (1, 5, 10, 20, len(TOPICS))
            if len(completed) >= threshold
        ],
    }
