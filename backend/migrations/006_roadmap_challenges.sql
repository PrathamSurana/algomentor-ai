-- Stable per-user challenge assignments. Verification is derived from saved Codeforces OK submissions.
CREATE TABLE IF NOT EXISTS roadmap_challenges (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_key varchar(50) NOT NULL,
    tier varchar(20) NOT NULL CHECK (tier IN ('beginner', 'intermediate', 'advanced')),
    contest_id integer NOT NULL,
    problem_index varchar(10) NOT NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, topic_key, tier),
    FOREIGN KEY (contest_id, problem_index)
        REFERENCES codeforces_problems(contest_id, problem_index)
);

CREATE INDEX IF NOT EXISTS roadmap_challenges_user_problem_idx
    ON roadmap_challenges(user_id, contest_id, problem_index);

ALTER TABLE roadmap_challenges ENABLE ROW LEVEL SECURITY;
