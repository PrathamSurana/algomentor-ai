from app.recommendation_engine import CandidateProblem, rank_problems, target_difficulty


def candidate(
    index: str, *, rating: int | None = 1000, topic: str = "implementation", contest: int = 100
):
    return CandidateProblem(contest, index, f"Fixture {index}", rating, (topic,), 42)


def rank(candidates, *, solved=None, assessments=None, ratings=None, profile_rating=None, limit=8):
    return rank_problems(
        candidates,
        solved_keys=solved or set(),
        assessments=assessments or [],
        solved_ratings=ratings or [],
        profile_rating=profile_rating,
        limit=limit,
    )


def test_solved_problems_are_never_returned_and_links_are_direct():
    problems = [candidate(str(index), contest=100 + index) for index in range(10)]
    result = rank(problems, solved={(100, "0"), (101, "1")}, limit=8)
    assert len(result["recommendations"]) == 8
    assert all(
        (item["contest_id"], item["problem_index"]) not in {(100, "0"), (101, "1")}
        for item in result["recommendations"]
    )
    assert all(
        item["url"]
        == f"https://codeforces.com/problemset/problem/{item['contest_id']}/{item['problem_index']}"
        for item in result["recommendations"]
    )
    assert all(
        item["rank_score"] == round(sum(item["contributions"].values()), 2)
        for item in result["recommendations"]
    )


def test_difficulty_fit_prefers_problem_near_solved_rating_target():
    problems = [
        candidate("A", rating=1500, contest=101),
        candidate("B", rating=2300, contest=102),
        candidate("C", rating=None, contest=103),
    ]
    result = rank(problems, ratings=[1400], limit=5)
    assert result["target_rating"] == 1500
    assert result["target_rating_source"] == "rated solves"
    assert result["recommendations"][0]["problem_index"] == "A"
    assert result["recommendations"][0]["contributions"]["difficulty"] == 35
    assert (
        result["recommendations"][0]["contributions"]["difficulty"]
        > result["recommendations"][1]["contributions"]["difficulty"]
    )


def test_weak_topic_and_prerequisite_readiness_affect_ranking():
    assessments = [
        {"topic": "dp", "score": 25, "attempted_unique": 10, "solved_unique": 3},
        {"topic": "greedy", "score": 80, "attempted_unique": 10, "solved_unique": 7},
        {"topic": "implementation", "score": 60, "attempted_unique": 10, "solved_unique": 3},
    ]
    ready = rank(
        [candidate("A", topic="dp"), candidate("B", topic="greedy")], assessments=assessments
    )
    assert ready["recommendations"][0]["target_topic"] == "dp"
    assert ready["recommendations"][0]["contributions"]["prerequisites"] == 20
    unready = rank(
        [candidate("A", topic="dp")],
        assessments=[
            {**item, "solved_unique": 0} if item["topic"] == "implementation" else item
            for item in assessments
        ],
    )
    assert unready["recommendations"][0]["contributions"]["prerequisites"] == 0


def test_diversity_reorders_equal_candidates():
    assessments = [
        {"topic": "implementation", "score": 20, "attempted_unique": 10, "solved_unique": 3},
        {"topic": "math", "score": 20, "attempted_unique": 10, "solved_unique": 3},
    ]
    problems = [
        candidate("A", topic="implementation", contest=100),
        candidate("B", topic="implementation", contest=101),
        candidate("C", topic="math", contest=102),
    ]
    result = rank(problems, assessments=assessments)
    assert [item["target_topic"] for item in result["recommendations"][:2]] == [
        "implementation",
        "math",
    ]
    assert result["recommendations"][2]["contributions"]["diversity"] < 10


def test_cold_start_and_missing_ratings_are_explicit():
    problems = [candidate(str(index), rating=None, contest=200 + index) for index in range(5)]
    result = rank(problems)
    assert result["cold_start"] is True
    assert result["target_rating"] == 1000
    assert result["target_rating_source"] == "starter default"
    assert len(result["recommendations"]) == 5
    assert all(item["rating"] is None for item in result["recommendations"])
    assert all("No Codeforces rating" in item["rationale"][1] for item in result["recommendations"])
    assert target_difficulty([], 1500) == (1400, "Codeforces profile rating")


def test_catalog_fallback_fills_list_when_target_topics_are_absent():
    problems = [candidate(str(index), topic="graphs", contest=300 + index) for index in range(6)]
    result = rank(problems, limit=5)
    assert len(result["recommendations"]) == 5
    assert all(item["target_topic"] == "graphs" for item in result["recommendations"])
    assert "Catalog fallback" in result["recommendations"][0]["rationale"][0]
