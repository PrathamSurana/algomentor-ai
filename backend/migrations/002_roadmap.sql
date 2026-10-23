-- Run after 001_codeforces.sql using the Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS roadmap_progress (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    milestone_key varchar(40) NOT NULL,
    completed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, milestone_key)
);

-- The browser has no direct table access. FastAPI verifies Supabase Auth and
-- accesses this table through the server-side database connection.
ALTER TABLE roadmap_progress ENABLE ROW LEVEL SECURITY;
