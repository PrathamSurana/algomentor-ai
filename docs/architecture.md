# MVP architecture and implementation plan

Target: deployable end-term project by October 27, 2026.

## System boundaries

```text
Browser (React/Vite) --Supabase Auth session--> FastAPI --SQL--> Supabase PostgreSQL
         |                                      |--public API--> Codeforces
         |                                      `--API key--> Gemini or OpenAI
         `--static assets--> Vercel
```

The browser uses Supabase Auth for email sign-in and sends its access token as `Authorization: Bearer`. FastAPI validates the token with Supabase Auth before accessing any user data. SQL access, Codeforces imports, scoring, recommendations, and AI calls all run on the backend. CORS allows only configured frontend origins. The database is accessed through a server-only connection string.

Codeforces imports use official public `user.info`, `user.status`, and `problemset.problems` methods. Requests are paced to respect the documented one-call-per-two-seconds limit; retryable failures use bounded backoff. Import pagination stops after reaching already-stored submission IDs or the end of history, with a documented per-sync safety cap. Upserts make retries safe. The problem catalog is refreshed separately and shared by all users.

## Database schema (planned migration 001)

| Table | Key fields | Constraints and purpose |
| --- | --- | --- |
| `profiles` | `user_id uuid`, `codeforces_handle text`, `last_synced_at timestamptz`, `sync_status text` | `user_id` references `auth.users`; handle is unique case-insensitively so one account cannot be connected to multiple profiles. |
| `problems` | `contest_id int`, `problem_index text`, `name text`, `rating int?`, `tags text[]`, `solved_count int?`, `updated_at timestamptz` | Primary key `(contest_id, problem_index)`; unrated problems remain visible but are excluded from rating-matched recommendations. |
| `submissions` | `submission_id bigint`, `user_id uuid`, `contest_id int?`, `problem_index text`, `verdict text?`, `created_at timestamptz`, `rating_at_import int?`, `tags_at_import text[]` | Primary key `submission_id`; index on `(user_id, created_at desc)`; snapshots preserve evidence when catalog metadata changes. |
| `topic_proficiency` | `user_id uuid`, `topic text`, `score numeric`, `confidence text`, `evidence_count int`, `calculated_at timestamptz` | Primary key `(user_id, topic)`; reproducible projection from submissions. |
| `roadmap_milestones` | `user_id uuid`, `milestone_key text`, `prerequisite_keys text[]`, `status text`, `completed_at timestamptz` | Primary key `(user_id, milestone_key)`; keys map to a versioned prerequisite graph in backend code. |
| `code_reviews` | `id uuid`, `user_id uuid`, `problem_key text?`, `language text`, `source_code text`, `feedback jsonb`, `created_at timestamptz` | Bounded code length; only the owner can retrieve review history. |

Every user-owned query is scoped by the verified `user_id`. Migrations enable row-level security to block direct browser reads of app tables. The backend database role and connection mode will be documented alongside the migration.

## API contract (planned)

| Method | Path | Role |
| --- | --- | --- |
| GET | `/health` | Liveness; no secrets or user data. |
| GET | `/me` | Current profile and import status. |
| PUT | `/me/codeforces` | Validate and connect a public Codeforces handle. |
| POST | `/imports/codeforces` | Import submissions with deduplication; return count, status, and sync time. |
| GET | `/dashboard` | Topic scores, confidence, recent activity, and summary. |
| GET | `/recommendations` | Ranked unsolved problems and rule-based explanations. |
| GET | `/roadmap` | Ordered milestones with prerequisites and persisted completion. |
| PATCH | `/roadmap/{key}` | Complete or reopen an eligible milestone. |
| POST | `/reviews` | Analyze pasted code and return validated structured feedback. |

Protected routes require a Supabase access token. Validation errors use 422; missing/invalid auth uses 401; upstream failures return 502 or 503 with a stable error code and retry guidance. The UI shows those states and allows a retry.

## Scoring and recommendation rules

Scoring stays deterministic and versioned. Each topic derives evidence from distinct problems, not repeated submissions. An accepted solution counts once per problem; unsuccessful attempts inform recent-performance weighting without rewarding retries. Problem rating determines difficulty weight, recency adds a bounded multiplier, and a Bayesian prior keeps small histories from producing extreme scores. Confidence depends on distinct rated problem count and recent activity; zero evidence is `insufficient_data`. Tests will pin exact examples and edge cases.

Recommendations exclude all solved problems and rank candidates from weak topics near the user's demonstrated rating band. Each item reports its relevant topic, rating fit, and why it was selected. Missing ratings or sparse histories use a conservative starter band and an explicit explanation.

The roadmap is a small, versioned DAG of DSA/CP milestones. Suggested focus follows weak topics while prerequisites control unlocks. Completion is stored per user and does not disappear after a rescore.

## Milestones

1. Scaffold: runnable React/Vite/Tailwind/Recharts package; FastAPI health route and settings; deployment files; docs; first commit.
2. Persistence and import: SQL migration, Supabase Auth validation, Codeforces client, import routes, deduplication, pagination, tests.
3. Coaching engine: deterministic scoring, confidence, recommendation ranking, dashboard API, tests.
4. Roadmap and review: prerequisite graph, completion API, provider-selectable structured AI review, tests.
5. Frontend and delivery: responsive dashboard, sign-in, complete API integration, error/retry states, deployment validation and README.

## Risks to track

Codeforces rate limits and temporary failures can delay a first import. The shared problem catalog may be large, so it must refresh outside the interactive request path. AI output requires schema validation and clear advisory labeling. A deployable demo needs Supabase, Codeforces access, and one configured AI provider.
