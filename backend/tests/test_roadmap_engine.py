import pytest

from app.roadmap_engine import MILESTONES, Milestone, build_roadmap, can_reopen, validate_graph


def test_graph_has_required_topics_and_no_cycles():
    assert {item.key for item in MILESTONES} == {
        "arrays",
        "hashing",
        "two_pointers",
        "binary_search",
        "recursion",
        "linked_lists",
        "stacks",
        "queues",
        "trees",
        "graphs",
        "greedy",
        "dynamic_programming",
    }
    validate_graph(MILESTONES)
    with pytest.raises(ValueError, match="cycle"):
        validate_graph(
            (
                Milestone("a", "A", "", ("b",), None, "none"),
                Milestone("b", "B", "", ("a",), None, "none"),
            )
        )
    with pytest.raises(ValueError, match="Unknown prerequisite"):
        validate_graph((Milestone("a", "A", "", ("missing",), None, "none"),))


def test_initial_and_unlocked_states():
    initial = build_roadmap(set())
    states = {item["key"]: item["state"] for item in initial["milestones"]}
    assert states["arrays"] == "ready"
    assert states["graphs"] == "locked"
    assert initial["recommended_key"] == "arrays"
    assert initial["completed_count"] == 0

    after_arrays = build_roadmap({"arrays"})
    states = {item["key"]: item["state"] for item in after_arrays["milestones"]}
    assert states["arrays"] == "completed"
    assert states["two_pointers"] == "ready"
    assert states["greedy"] == "locked"
    assert states["queues"] == "locked"


def test_next_milestone_uses_weak_ready_topic_and_labels_proxy():
    assessments = [
        {"topic": "two pointers", "score": 25, "confidence": "low"},
        {"topic": "binary search", "score": 80, "confidence": "medium"},
        {"topic": "data structures", "score": 40, "confidence": "low"},
    ]
    result = build_roadmap({"arrays"}, assessments)
    assert result["recommended_key"] == "two_pointers"
    hashing = next(item for item in result["milestones"] if item["key"] == "hashing")
    assert hashing["skill_source"] == "proxy"
    assert hashing["proficiency_score"] == 40


def test_reopening_prerequisite_requires_descendants_to_be_reopened_first():
    completed = {"arrays", "hashing", "greedy"}
    assert can_reopen("arrays", completed) is False
    assert can_reopen("hashing", completed) is False
    assert can_reopen("greedy", completed) is True
    assert can_reopen("hashing", completed - {"greedy"}) is True
