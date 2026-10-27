-- Add user-provided LeetCode data without altering existing Codeforces or review tables.
ALTER TABLE leetcode_profile_snapshots
    ADD COLUMN IF NOT EXISTS source varchar(24) NOT NULL DEFAULT 'authorized_graphql';

CREATE TABLE IF NOT EXISTS leetcode_solved_problems (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slug varchar(160) NOT NULL,
    title varchar(300) NOT NULL,
    difficulty varchar(10) CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    accepted_at timestamptz,
    topics jsonb NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (user_id, slug)
);

CREATE INDEX IF NOT EXISTS leetcode_solved_user_date_idx
    ON leetcode_solved_problems(user_id, accepted_at DESC);

ALTER TABLE leetcode_solved_problems ENABLE ROW LEVEL SECURITY;