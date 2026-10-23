# MVP architecture and implementation plan

Target: deployable end-term project by October 27, 2026.

Current build: `GET /health` reports process liveness and `GET /health/ready` reports database connectivity. `POST /codeforces/sync` imports a public handle; `GET /codeforces/users/{handle}/summary` serves persisted solved problems and topic counts; `GET /codeforces/users/{handle}/skills` returns the deterministic assessment; `GET /codeforces/users/{handle}/recommendations` ranks unsolved catalog problems. Authenticated roadmap and review routes manage persistent milestone completion and AI feedback history. The shared contract is `shared/openapi.json`, generated from FastAPI, with TypeScript types in `frontend/src/generated/api.ts`.

The Codeforces migration creates `codeforces_users`, `codeforces_problems`, and `codeforces_submissions`. These tables intentionally hold only public data keyed by the Codeforces handle. Migration 002 adds `roadmap_progress` keyed by Supabase Auth user ID and milestone key. Migration 003 adds `code_reviews` with code, optional problem context, provider metadata, and validated JSON feedback, keyed to a Supabase Auth user. The backend verifies the access token through Supabase Auth before serving or changing user-owned data. The dashboard's topic distribution is a distinct accepted-problem count per Codeforces tag; the skill assessment endpoint provides deterministic estimates from that history.

## System boundaries

```text
Browser (React/Vite) --Supabase Auth session--> FastAPI --SQL--> Supabase PostgreSQL
         |                                      |--public API--> Codeforces
         |                                      `--API key--> Gemini or OpenAI
         `--static assets--> Vercel
```

The browser uses Supabase Auth for email sign-in and sends its access token as `Authorization: Bearer`. FastAPI validates the token with Supabase Auth before accessing any user data. SQL access, Codeforces imports, scoring, recommendations, and AI calls all run on the backend. CORS allows only configured frontend origins. The database is accessed through a server-only connection string.

Codeforces imports use official public `user.info`, `user.status`, and `problemset.problems` methods. Requests are paced to respect the documented one-call-per-two-seconds limit; retryable failures use bounded backoff. Import pagination stops after reaching already-stored submission IDs or the end of history, with a documented per-sync safety cap. Upserts make retries safe. The problem catalog is refreshed separately and shared by all users.

## Future coaching schema

The table below records earlier ideas that remain outside the MVP. The implemented tables live in migrations 001, 002, and 003.

| Table | Key fields | Constraints and purpose |
| --- | --- | --- |
| `profiles` | `user_id uuid`, `codeforces_handle text`, `last_synced_at timestamptz`, `sync_status text` | `user_id` references `auth.users`; handle is unique case-insensitively so one account cannot be connected to multiple profiles. |
| `problems` | `contest_id int`, `problem_index text`, `name text`, `rating int?`, `tags text[]`, `solved_count int?`, `updated_at timestamptz` | Primary key `(contest_id, problem_index)`; unrated problems remain visible but are excluded from rating-matched recommendations. |
| `submissions` | `submission_id bigint`, `user_id uuid`, `contest_id int?`, `problem_index text`, `verdict text?`, `created_at timestamptz`, `rating_at_import int?`, `tags_at_import text[]` | Primary key `submission_id`; index on `(user_id, created_at desc)`; snapshots preserve evidence when catalog metadata changes. |
| `topic_proficiency` | `user_id uuid`, `topic text`, `score numeric`, `confidence text`, `evidence_count int`, `calculated_at timestamptz` | Primary key `(user_id, topic)`; reproducible projection from submissions. |

Every user-owned query is scoped by the verified `user_id`. Migrations enable row-level security to block direct browser reads of app tables. The backend database role and connection mode will be documented alongside the migration.

## API contract

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
| GET | `/reviews` | List the signed-in user's recent review summaries. |
| GET | `/reviews/{id}` | Retrieve one signed-in user's saved code and feedback. |

Protected routes require a Supabase access token. Validation errors use 422; missing/invalid auth uses 401; upstream failures return 502 or 503 with a stable error code and retry guidance. The UI shows those states and allows a retry.

## Scoring and recommendation rules

Scoring version 1.0 is implemented in `backend/app/skill_engine.py` and exposed at `GET /codeforces/users/{handle}/skills`. Each topic uses one record per distinct attempted problem. An `OK` verdict marks a solve once. Observable failed verdicts before the first accepted submission, or on an unsolved problem, count toward efficiency; at most three failures per problem affect the score. Pending verdicts are ignored. A problem with several Codeforces tags contributes to each tag.

The components are normalized to 0–1: distinct solve rate; mean difficulty of rated solved problems, with each rating mapped by `clamp((rating - 800) / 2400, 0, 1)`; efficiency `1 - sum(min(failures_per_problem, 3)) / (3 × distinct_attempted)`; and 90-day performance `new_distinct_solves / distinct_recent_attempted`. Base weights are 40%, 25%, 15%, and 20%. Missing difficulty or recent evidence removes that component and redistributes its weight proportionally. The published 0–100 score is the weighted sum rounded to an integer, so it is an estimate rather than a calibrated probability or exact skill measurement.

No score is published until the full submission history is imported and the topic has at least five distinct attempted problems, three distinct solves, and two rated solves. Component evidence and rationale are still returned when the score is null. Confidence is `low` by default; `medium` requires 10 attempts, five rated solves, and three recent attempted problems; `high` requires 25 attempts, 10 rated solves, and five recent attempted problems. These thresholds are deterministic sample-size labels, not statistical confidence intervals.

Recommendation version 1.0 is implemented in `backend/app/recommendation_engine.py`. The API excludes every stored accepted problem before ranking. It withholds the list while older submission pages remain or an accepted problem lacks a contest ID, because solved-problem filtering cannot then be guaranteed. With complete but empty history, it starts with implementation and math topics at rating 1000. The target rating is the median rating of distinct solved problems plus 100; when none are rated, it uses Codeforces profile rating minus 100; when that is absent, it uses 1000. All targets are clamped to 800–3200.

Each candidate gets up to 35 points for topic priority, 35 for proximity to target rating (falling to zero at a 600-point gap; unrated problems get a conservative fixed fit), 20 for mapped prerequisite readiness, and 10 for diversity. Readiness uses three distinct solves per prerequisite topic as its full-credit threshold. A greedy second pass recalculates diversity after each pick to favor new topics and contests. The response exposes all four numeric contributions and deterministic rationale. The small prerequisite map is a recommendation heuristic until the persistent roadmap exists. If the requested target topics lack enough catalog problems, low-priority catalog tags fill the remaining slots. The API returns 5–10 results when that many eligible tagged, unsolved problems exist, and reports `catalog_limited` otherwise.

Roadmap version 1.0 is a validated DAG with twelve milestones: arrays, hashing, two pointers, binary search, recursion, linked lists, stacks, queues, trees, graphs, greedy, and dynamic programming. A milestone is locked until all prerequisite keys are completed, ready afterward, and completed when the signed-in user marks it done. The next milestone is the ready item with the lowest available topic proficiency estimate; missing estimates get neutral priority and graph order breaks ties. Broader Codeforces tags used as proxies are labeled. Completion persists per Supabase Auth user and does not disappear after a rescore. Reopening a prerequisite is blocked while a completed descendant depends on it.

Code review accepts Python, C++, or Java source of 20–20,000 characters and up to 4,000 characters of optional context. When a stored Codeforces problem ID is supplied, the backend adds its public name, rating, and tags. A configurable Gemini or OpenAI adapter requests JSON fields for approach, complexity estimates with reasoning, edge cases, improvements, and uncertainty. Pydantic validates the returned content before persistence. Provider keys stay server-side, transient provider failures receive bounded retries, and the UI labels feedback as advisory. Submitted code is never executed.

## Milestones

1. Scaffold: runnable React/Vite/Tailwind/Recharts package; FastAPI health route and settings; deployment files; docs; first commit.
2. Persistence and import: SQL migration, Supabase Auth validation, Codeforces client, import routes, deduplication, pagination, tests.
3. Coaching engine: deterministic scoring, confidence, recommendation ranking, dashboard API, tests.
4. Roadmap and review: prerequisite graph, completion API, provider-selectable structured AI review, tests.
5. Frontend and delivery: responsive dashboard, sign-in, complete API integration, error/retry states, deployment validation and README.

## Risks to track

Codeforces rate limits and temporary failures can delay a first import. The shared problem catalog may be large, so it must refresh outside the interactive request path. AI output requires schema validation and clear advisory labeling. A deployable demo needs Supabase, Codeforces access, and one configured AI provider.
