CREATE TABLE IF NOT EXISTS code_reviews (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    language varchar(10) NOT NULL CHECK (language IN ('python', 'cpp', 'java')),
    source_code text NOT NULL,
    problem_context text,
    contest_id integer,
    problem_index varchar(10),
    problem_title varchar(300),
    feedback jsonb NOT NULL,
    provider varchar(20) NOT NULL,
    model varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT code_reviews_problem_pair CHECK (
        (contest_id IS NULL AND problem_index IS NULL)
        OR (contest_id IS NOT NULL AND problem_index IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS code_reviews_user_created_idx
    ON code_reviews (user_id, created_at DESC);

ALTER TABLE code_reviews ENABLE ROW LEVEL SECURITY;
