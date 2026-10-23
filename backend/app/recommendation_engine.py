"""Deterministic Codeforces problem ranking over a persisted public catalog."""

from collections import Counter
from dataclasses import dataclass
from statistics import median

RECOMMENDATION_VERSION = "1.0"
WEIGHTS = {"topic": 35.0, "difficulty": 35.0, "prerequisites": 20.0, "diversity": 10.0}
PREREQUISITES = {
    "brute force": ("implementation",),
    "greedy": ("implementation",),
    "sortings": ("implementation",),
    "binary search": ("sortings",),
    "two pointers": ("sortings",),
    "dp": ("implementation",),
    "graphs": ("implementation",),
    "dfs and similar": ("graphs",),
    "shortest paths": ("graphs",),
    "trees": ("dfs and similar",),
    "number theory": ("math",),
}
STARTER_TOPICS = {"implementation": 1.0, "math": 0.9, "brute force": 0.8, "greedy": 0.75}


@dataclass(frozen=True)
class CandidateProblem:
    contest_id: int
    problem_index: str
    name: str
    rating: int | None
    tags: tuple[str, ...]
    solved_count: int | None

    @property
    def key(self) -> tuple[int, str]:
        return (self.contest_id, self.problem_index)


def target_difficulty(solved_ratings: list[int], profile_rating: int | None) -> tuple[int, str]:
    if solved_ratings:
        return max(800, min(3200, round(median(solved_ratings) + 100))), "rated solves"
    if profile_rating is not None:
        return max(800, min(3200, profile_rating - 100)), "Codeforces profile rating"
    return 1000, "starter default"


def topic_priorities(assessments: list[dict]) -> dict[str, float]:
    if not assessments:
        return STARTER_TOPICS.copy()
    priorities = {}
    for topic in assessments:
        if topic["score"] is not None:
            priority = max(0.25, 1 - topic["score"] / 100)
        else:
            attempted = topic["attempted_unique"]
            solved = topic["solved_unique"]
            priority = max(0.35, 0.75 - 0.30 * solved / attempted) if attempted else 0.75
        priorities[topic["topic"]] = round(priority, 4)
    for topic, priority in STARTER_TOPICS.items():
        priorities.setdefault(topic, round(priority * 0.55, 4))
    return priorities


def _readiness(topic: str, solved_by_topic: dict[str, int]) -> tuple[float, tuple[str, ...]]:
    required = PREREQUISITES.get(topic, ())
    if not required:
        return 1.0, required
    return sum(min(solved_by_topic.get(item, 0) / 3, 1.0) for item in required) / len(
        required
    ), required


def _candidate_score(
    candidate: CandidateProblem,
    *,
    priorities: dict[str, float],
    solved_by_topic: dict[str, int],
    target_rating: int,
    target_source: str,
    evidence_topics: set[str],
    selected_topics: Counter[str],
    selected_contests: Counter[int],
) -> dict | None:
    matching = set(candidate.tags).intersection(priorities)
    if not matching:
        return None
    topic = min(matching, key=lambda item: (-priorities[item], item))
    priority = priorities[topic]
    difficulty_fit = (
        max(0.0, 1 - abs(candidate.rating - target_rating) / 600)
        if candidate.rating is not None
        else 0.25
    )
    readiness, prerequisites = _readiness(topic, solved_by_topic)
    diversity = max(
        0.0,
        1 - 0.35 * selected_topics[topic] - 0.25 * selected_contests[candidate.contest_id],
    )
    contributions = {
        "topic": round(WEIGHTS["topic"] * priority, 2),
        "difficulty": round(WEIGHTS["difficulty"] * difficulty_fit, 2),
        "prerequisites": round(WEIGHTS["prerequisites"] * readiness, 2),
        "diversity": round(WEIGHTS["diversity"] * diversity, 2),
    }
    difficulty_reason = (
        f"Rating {candidate.rating} is {abs(candidate.rating - target_rating)} from target "
        f"{target_rating}, based on {target_source}."
        if candidate.rating is not None
        else f"No Codeforces rating is available; target {target_rating} uses {target_source} "
        "and difficulty fit is conservative."
    )
    readiness_reason = (
        "No mapped prerequisites for this topic."
        if not prerequisites
        else f"Prerequisite readiness {readiness:.2f} from "
        + ", ".join(f"{item} ({solved_by_topic.get(item, 0)} solves)" for item in prerequisites)
        + "; three distinct solves per prerequisite count as ready."
    )
    return {
        "contest_id": candidate.contest_id,
        "problem_index": candidate.problem_index,
        "name": candidate.name,
        "rating": candidate.rating,
        "tags": list(candidate.tags),
        "solved_count": candidate.solved_count,
        "url": f"https://codeforces.com/problemset/problem/{candidate.contest_id}/{candidate.problem_index}",
        "target_topic": topic,
        "rank_score": round(sum(contributions.values()), 2),
        "contributions": contributions,
        "rationale": [
            (
                f"Topic {topic} has priority {priority:.2f} from stored topic evidence."
                if topic in evidence_topics
                else f"Starter topic {topic} has priority {priority:.2f}."
                if topic in STARTER_TOPICS
                else f"Catalog fallback topic {topic} has priority {priority:.2f}."
            ),
            difficulty_reason,
            readiness_reason,
            f"Diversity factor {diversity:.2f}: {selected_topics[topic]} prior picks in this topic "
            f"and {selected_contests[candidate.contest_id]} from this contest.",
        ],
    }


def rank_problems(
    candidates: list[CandidateProblem],
    *,
    solved_keys: set[tuple[int, str]],
    assessments: list[dict],
    solved_ratings: list[int],
    profile_rating: int | None,
    limit: int = 8,
) -> dict:
    """Greedy reranking makes the diversity contribution depend on earlier picks."""
    target_rating, target_source = target_difficulty(solved_ratings, profile_rating)
    priorities = topic_priorities(assessments)
    cold_start = not solved_keys
    evidence_topics = {topic["topic"] for topic in assessments}
    solved_by_topic = {topic["topic"]: topic["solved_unique"] for topic in assessments}
    remaining = {
        candidate.key: candidate for candidate in candidates if candidate.key not in solved_keys
    }
    matching_count = sum(
        bool(set(candidate.tags) & priorities.keys()) for candidate in remaining.values()
    )
    if matching_count < limit:
        catalog_topics = Counter(
            tag for candidate in remaining.values() for tag in set(candidate.tags)
        )
        for topic, _ in sorted(catalog_topics.items(), key=lambda item: (-item[1], item[0])):
            priorities.setdefault(topic, 0.25)
    selected: list[dict] = []
    selected_topics: Counter[str] = Counter()
    selected_contests: Counter[int] = Counter()

    for _ in range(min(limit, len(remaining))):
        ranked = []
        for candidate in remaining.values():
            item = _candidate_score(
                candidate,
                priorities=priorities,
                solved_by_topic=solved_by_topic,
                target_rating=target_rating,
                target_source=target_source,
                evidence_topics=evidence_topics,
                selected_topics=selected_topics,
                selected_contests=selected_contests,
            )
            if item is not None:
                ranked.append(item)
        if not ranked:
            break
        ranked.sort(
            key=lambda item: (
                -item["rank_score"],
                abs(item["rating"] - target_rating) if item["rating"] is not None else 9999,
                item["contest_id"],
                item["problem_index"],
            )
        )
        best = ranked[0]
        selected.append(best)
        selected_topics[best["target_topic"]] += 1
        selected_contests[best["contest_id"]] += 1
        del remaining[(best["contest_id"], best["problem_index"])]

    return {
        "version": RECOMMENDATION_VERSION,
        "target_rating": target_rating,
        "target_rating_source": target_source,
        "cold_start": cold_start,
        "recommendations": selected,
    }
