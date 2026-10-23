"""Versioned prerequisite graph and deterministic milestone selection."""

from dataclasses import dataclass

ROADMAP_VERSION = "1.0"


@dataclass(frozen=True)
class Milestone:
    key: str
    title: str
    description: str
    prerequisites: tuple[str, ...]
    skill_tag: str | None
    skill_source: str  # direct, proxy, or none


MILESTONES = (
    Milestone(
        "arrays",
        "Arrays",
        "Indexing, traversal, and prefix patterns.",
        (),
        "implementation",
        "proxy",
    ),
    Milestone(
        "hashing",
        "Hashing",
        "Maps, sets, counting, and lookup patterns.",
        ("arrays",),
        "data structures",
        "proxy",
    ),
    Milestone(
        "two_pointers",
        "Two pointers",
        "Window and paired-index techniques.",
        ("arrays",),
        "two pointers",
        "direct",
    ),
    Milestone(
        "binary_search",
        "Binary search",
        "Search on sorted data and answer space.",
        ("arrays",),
        "binary search",
        "direct",
    ),
    Milestone(
        "recursion",
        "Recursion",
        "Base cases, call stacks, and recursive decomposition.",
        ("arrays",),
        "dfs and similar",
        "proxy",
    ),
    Milestone(
        "linked_lists",
        "Linked lists",
        "Pointer updates and list operations.",
        ("arrays",),
        "data structures",
        "proxy",
    ),
    Milestone(
        "stacks",
        "Stacks",
        "LIFO processing and monotonic patterns.",
        ("arrays",),
        "data structures",
        "proxy",
    ),
    Milestone(
        "queues",
        "Queues",
        "FIFO processing and breadth-first patterns.",
        ("stacks",),
        "data structures",
        "proxy",
    ),
    Milestone(
        "trees", "Trees", "Tree traversal and subtree reasoning.", ("recursion",), "trees", "direct"
    ),
    Milestone(
        "graphs",
        "Graphs",
        "Traversal, connectivity, and path basics.",
        ("trees", "queues"),
        "graphs",
        "direct",
    ),
    Milestone(
        "greedy",
        "Greedy",
        "Local-choice strategies and proofs.",
        ("arrays", "hashing"),
        "greedy",
        "direct",
    ),
    Milestone(
        "dynamic_programming",
        "Dynamic programming",
        "State transitions and memoization.",
        ("recursion", "greedy"),
        "dp",
        "direct",
    ),
)


def validate_graph(milestones: tuple[Milestone, ...]) -> None:
    keys = {item.key for item in milestones}
    if len(keys) != len(milestones):
        raise ValueError("Milestone keys must be unique")
    dependencies = {item.key: item.prerequisites for item in milestones}
    visited: set[str] = set()
    visiting: set[str] = set()

    def visit(key: str) -> None:
        if key in visiting:
            raise ValueError("Roadmap graph contains a cycle")
        if key in visited:
            return
        visiting.add(key)
        for parent in dependencies[key]:
            if parent not in keys:
                raise ValueError(f"Unknown prerequisite: {parent}")
            visit(parent)
        visiting.remove(key)
        visited.add(key)

    for key in dependencies:
        visit(key)


validate_graph(MILESTONES)
BY_KEY = {item.key: item for item in MILESTONES}


def can_reopen(key: str, completed: set[str]) -> bool:
    """A completed milestone stays required by its completed descendants."""
    dependents = {key}
    while True:
        next_dependents = dependents | {
            item.key
            for item in MILESTONES
            if any(parent in dependents for parent in item.prerequisites)
        }
        if next_dependents == dependents:
            break
        dependents = next_dependents
    return not bool((dependents - {key}) & completed)


def build_roadmap(completed: set[str], assessments: list[dict] | None = None) -> dict:
    assessments_by_tag = {item["topic"]: item for item in (assessments or [])}
    milestones = []
    for order, definition in enumerate(MILESTONES):
        missing = [parent for parent in definition.prerequisites if parent not in completed]
        state = "completed" if definition.key in completed else "locked" if missing else "ready"
        assessment = assessments_by_tag.get(definition.skill_tag) if definition.skill_tag else None
        score = assessment["score"] if assessment else None
        confidence = assessment["confidence"] if assessment else "insufficient_data"
        milestones.append(
            {
                "key": definition.key,
                "title": definition.title,
                "description": definition.description,
                "prerequisites": list(definition.prerequisites),
                "missing_prerequisites": missing,
                "state": state,
                "completed": state == "completed",
                "proficiency_score": score,
                "proficiency_confidence": confidence,
                "skill_tag": definition.skill_tag,
                "skill_source": definition.skill_source,
                "order": order,
            }
        )

    ready = [item for item in milestones if item["state"] == "ready"]
    # Missing evidence gets a neutral priority; lower measured proficiency comes first.
    recommended = (
        min(
            ready,
            key=lambda item: (
                item["proficiency_score"] if item["proficiency_score"] is not None else 60,
                item["order"],
            ),
        )
        if ready
        else None
    )
    if recommended is not None:
        if recommended["proficiency_score"] is None:
            reason = (
                "Prerequisites are complete; choose this foundational milestone "
                "while topic evidence is insufficient."
            )
        elif recommended["skill_source"] == "proxy":
            reason = (
                "Prerequisites are complete; a broader Codeforces tag suggests a "
                f"{recommended['proficiency_score']}/100 estimate. This is a proxy."
            )
        else:
            reason = (
                "Prerequisites are complete; this ready topic has a "
                f"{recommended['proficiency_score']}/100 proficiency estimate."
            )
    else:
        reason = None
    return {
        "version": ROADMAP_VERSION,
        "recommended_key": recommended["key"] if recommended else None,
        "recommendation_reason": reason,
        "completed_count": sum(item["completed"] for item in milestones),
        "total_count": len(milestones),
        "milestones": milestones,
    }
