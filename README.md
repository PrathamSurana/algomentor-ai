# AlgoMentor AI

AlgoMentor AI connects a signed-in learner to their public Codeforces history. It imports submissions and ratings from the official API, shows analytics, recommends unsolved practice, verifies roadmap challenges from accepted submissions, and saves Gemini code reviews.

## Local setup

1. Install backend dependencies in `backend/.venv` and frontend dependencies with `npm install` in `frontend`.
2. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Set the Supabase database URL, Supabase Auth URL and publishable key, Gemini key, frontend origin, and frontend API URL. Keep server keys in the backend only.
3. Run SQL files in `backend/migrations` in numeric order in the Supabase SQL editor. Existing databases should apply only missing migrations. Migration 006 creates persistent, user-owned roadmap challenge assignments. Historical migrations 004 and 005 remain for safe upgrades of existing databases; the current product does not use their retired platform tables.
4. Run `make dev-api` and `make dev-web` from the project root.

The API readiness endpoint (`/health/ready`) checks required tables. Authenticated endpoints validate a Supabase access token and scope linked accounts, challenges, reviews, and analytics by the verified user ID. Public Codeforces history is shared by handle; user-owned links and assignments are private.

## How to use

Sign in with Google or email magic link. On Overview, enter a Codeforces handle and select **Connect handle**. Sync imports the official public profile, catalog metadata, available submission pages, and contest rating changes. Large histories may take several requests; **Load older submissions** resumes from the saved cursor. The status and last successful sync time are shown in the app. A catalog or rating request can fail independently while already saved submissions remain available.

### Evaluator demo

Select **Explore Demo** on the login screen. This opens Demo Student immediately, without Google login, a Codeforces handle, or a running API. The overview, recommendations, roadmap, and saved example code review use clearly labeled illustrative data. The roadmap contains all 38 branching topics and three genuine public Codeforces problem links per topic. Click a topic to inspect its challenges, then select **Simulate Accepted Submission** to complete the next available sample challenge. Completing the Arrays advanced challenge unlocks its dependent topics. **Reset Demo** restores the original sample progress; **Exit Demo** returns to login.

Demo progress is held only in browser session storage and is cleared on exit. Demo actions never call the Codeforces sync, Gemini review, or private user endpoints and never write to Supabase. Sample ratings, solves, and review feedback are illustrative; no demo result is attributed to a real Codeforces user. The same frontend bundle can serve this mode on the deployed site without extra environment variables or database migrations.

The **Roadmap** shows 38 branching DSA and competitive programming topics. Each topic has prerequisite edges and up to three stable, required challenge assignments selected from the stored official Codeforces catalog. A challenge is verified only when the linked account has a saved `OK` submission for its contest ID and problem index. Historical solves count. Three verified required challenges complete a topic and unlock downstream topics. If the catalog has too few matching rated problems, the node shows the shortage and cannot be completed yet. Some specialized topics use broader Codeforces tags; the tag is shown in the detail panel.

The analytics dashboard separates submission events, accepted submissions, and distinct accepted problems. It provides time series, a 365-day activity view, topic coverage, rating progression, difficulty evidence, roadmap status, and recommendations. Missing history remains unavailable instead of being represented as observed zero activity. Recommendations exclude saved accepted problems and assigned required roadmap challenges when the import is complete.

Code review supports Python, C++, and Java. Feedback and review history are stored under the signed-in Supabase user. Gemini credentials stay on the server.

## Main endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /platforms/codeforces/sync` | Authenticated, user-linked submission and rating sync |
| `GET /platforms/accounts` | Linked account and sync status |
| `GET /roadmap/tree` | Verified, user-owned challenge graph |
| `GET /analytics?period=daily\|weekly\|monthly` | Stored-history dashboard data |
| `GET /codeforces/users/{handle}/summary` | Public distinct-solve summary |
| `GET /codeforces/users/{handle}/skills` | Deterministic skill evidence |
| `GET /codeforces/users/{handle}/recommendations` | Public catalog recommendations |
| `POST /reviews`, `GET /reviews` | Authenticated AI code reviews and history |

Legacy roadmap endpoints remain available to preserve existing saved progress, but the current roadmap UI and dashboard progress use verified challenges from `/roadmap/tree`.

## Checks

Run `make contract` after changing FastAPI routes, then `make lint`, `make test`, and `make build`. Tests use isolated fixtures; they do not prove that a live Supabase project has migrations applied or that a deployed Codeforces connection is reachable. See [architecture](docs/architecture.md) and [demo checklist](docs/demo.md).
