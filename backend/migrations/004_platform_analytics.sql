-- Server-owned public-platform snapshots scoped to a verified Supabase user.
CREATE TABLE IF NOT EXISTS linked_platform_accounts (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform varchar(20) NOT NULL CHECK (platform IN ('codeforces', 'leetcode')),
    username varchar(40) NOT NULL,
    username_key varchar(40) NOT NULL,
    synced_at timestamptz,
    sync_status varchar(20) NOT NULL DEFAULT 'pending',
    sync_error varchar(300),
    PRIMARY KEY (user_id, platform)
);

CREATE TABLE IF NOT EXISTS leetcode_profile_snapshots (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username varchar(40) NOT NULL,
    avatar_url varchar(500),
    profile_ranking integer,
    total_solved integer,
    easy_solved integer,
    medium_solved integer,
    hard_solved integer,
    contest_rating double precision,
    contest_ranking integer,
    contest_count integer,
    topics jsonb,
    recent_accepted jsonb,
    unavailable_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    synced_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS leetcode_activity (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_date date NOT NULL,
    submission_count integer NOT NULL CHECK (submission_count >= 0),
    PRIMARY KEY (user_id, activity_date)
);

CREATE TABLE IF NOT EXISTS leetcode_contests (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contest_title varchar(160) NOT NULL,
    start_at timestamptz,
    rating double precision,
    ranking integer,
    PRIMARY KEY (user_id, contest_title)
);

CREATE TABLE IF NOT EXISTS codeforces_rating_changes (
    handle_key varchar(24) NOT NULL REFERENCES codeforces_users(handle_key),
    contest_id integer NOT NULL,
    contest_name varchar(300) NOT NULL,
    rated_at timestamptz NOT NULL,
    old_rating integer NOT NULL,
    new_rating integer NOT NULL,
    rank integer,
    PRIMARY KEY (handle_key, contest_id)
);

CREATE INDEX IF NOT EXISTS leetcode_contests_user_time_idx
    ON leetcode_contests(user_id, start_at DESC);
CREATE INDEX IF NOT EXISTS codeforces_rating_handle_time_idx
    ON codeforces_rating_changes(handle_key, rated_at DESC);

-- No browser policies: the app verifies the bearer token in FastAPI and uses
-- a private PostgreSQL connection. Supabase client roles cannot read/write these tables.
ALTER TABLE linked_platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_profile_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE codeforces_rating_changes ENABLE ROW LEVEL SECURITY;