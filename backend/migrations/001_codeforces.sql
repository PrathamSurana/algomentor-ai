-- Apply with psql to the Supabase PostgreSQL database before using Codeforces routes.
CREATE TABLE IF NOT EXISTS codeforces_users (
    handle_key varchar(24) PRIMARY KEY,
    handle varchar(24) NOT NULL,
    rating integer,
    rank varchar(40),
    avatar_url varchar(500),
    synced_at timestamptz,
    next_from integer
);

CREATE TABLE IF NOT EXISTS codeforces_problems (
    contest_id integer NOT NULL,
    problem_index varchar(10) NOT NULL,
    name varchar(300) NOT NULL,
    rating integer,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    solved_count integer,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (contest_id, problem_index)
);

CREATE TABLE IF NOT EXISTS codeforces_submissions (
    submission_id bigint NOT NULL,
    handle_key varchar(24) NOT NULL REFERENCES codeforces_users(handle_key),
    contest_id integer,
    problem_index varchar(10) NOT NULL,
    verdict varchar(40),
    created_at timestamptz NOT NULL,
    rating_at_import integer,
    tags_at_import jsonb NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (handle_key, submission_id)
);

CREATE INDEX IF NOT EXISTS codeforces_submissions_handle_time_idx
    ON codeforces_submissions(handle_key, created_at DESC);

-- All data in these tables comes from the public Codeforces API. Browser access
-- is denied; FastAPI uses the server-side database connection.
ALTER TABLE codeforces_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE codeforces_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE codeforces_submissions ENABLE ROW LEVEL SECURITY;
