# AlgoMentor AI

AlgoMentor AI is a DSA and competitive programming coach in development. It imports **public** Codeforces history, displays skill estimates and unsolved problem recommendations, and tracks a prerequisite-based DSA/CP roadmap for signed-in users. The rules and later coaching architecture are in [docs/architecture.md](docs/architecture.md).

## Prerequisites

- Node.js 20.19+ or 22.12+ and npm 10+
- Python 3.10+ and `make`
- A Supabase project with PostgreSQL, a publishable key, and Email Auth enabled for persistent roadmap progress

## Local setup

Run these commands from the repository root. The health endpoint works without Supabase credentials. To make `/health/ready` return 200, configure the database connection in step 2.

1. Install the backend:

   ```bash
   cd backend
   python3 -m venv .venv
   .venv/bin/pip install -e '.[dev]'
   cp .env.example .env
   cd ..
   ```

2. Edit `backend/.env`. Replace `DATABASE_URL` with the Supabase **Session pooler** connection URI from the Supabase dashboard. Change the scheme from `postgresql://` to `postgresql+psycopg://` and add `?sslmode=require` (or `&sslmode=require` if the URI already has query parameters). URL-encode special characters in the password. The placeholder URI in `.env.example` is intentionally unusable. Keep this file local; it is gitignored.

   In the Supabase SQL Editor, run the full contents of `backend/migrations/001_codeforces.sql`, then `backend/migrations/002_roadmap.sql`. This creates the public Codeforces tables and the user-owned roadmap progress table. Both migrations enable row-level security with no browser policies; FastAPI uses the server-side database connection. The application does not create tables automatically. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `backend/.env` to your project's values.

3. Install the frontend:

   ```bash
   cd frontend
   npm ci
   cp .env.example .env.local
   cd ..
   ```

   For local development, `VITE_API_BASE_URL=http://localhost:8000` is already set in the example. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the same Supabase project's public URL and publishable key. In Supabase Auth URL configuration, allow `http://localhost:5173` as a redirect URL; allow your Vercel origin for deployment. Enable email magic-link sign-in. Never put the database URL or an AI API key in a `VITE_` variable.

4. Start the API and frontend in separate terminals from the repository root:

   ```bash
   make dev-api
   ```

   ```bash
   make dev-web
   ```

5. Open `http://localhost:5173`. API docs are at `http://localhost:8000/docs`. Check liveness with `curl http://localhost:8000/health`; check the configured database with `curl -i http://localhost:8000/health/ready`. A 503 readiness response means the database URL is unset, still a placeholder, or unreachable. Enter a public Codeforces handle and click **Sync history**. The dashboard shows the imported submission and distinct solved counts, a topic chart, and the most recent 100 solved problems. If it offers **Load older submissions**, click that to continue the stored pagination cursor.

## Codeforces sync API

`POST /codeforces/sync` accepts `{"handle":"tourist","mode":"refresh"}`. Use `mode:"continue"` to fetch older pages after a response with `has_more:true`. `GET /codeforces/users/{handle}/summary` reads saved data and makes no Codeforces request. Handles are validated and normalized case-insensitively; re-syncs upsert submissions and avoid duplicate counts. Each sync imports at most five pages of 1,000 submissions, so large histories need multiple **Load older** actions. A fresh sync starts at the newest page and resets the older-page cursor.

`GET /codeforces/users/{handle}/skills` computes versioned topic estimates from saved submissions without calling Codeforces. It returns counts, normalized components, applied weights, confidence, and plain-language rationale. A score is `null` until history import is complete and the topic has at least five distinct attempts, three solves, and two rated solves. The dashboard charts only published estimates and shows insufficient-data states for other topics. Skill scores are advisory estimates, not exact measurements.

`GET /codeforces/users/{handle}/recommendations?limit=8` reads saved problems and performance and returns 5–10 ranked unsolved problems when the catalog has enough eligible entries. Each item includes a direct Codeforces link, a target topic, four numeric ranking contributions, and an explanation. The **Recommendations** page fetches this endpoint after a handle is synced. If older submissions remain, the endpoint returns `history_incomplete` with no recommendations so it cannot present a previously solved problem. `catalog_limited` reports fewer than five eligible problems; `history_unverifiable` means an accepted submission lacks the problem identity needed for safe filtering. Cold-start users receive a starter rating target, and unrated catalog problems have a conservative difficulty fit.

## Roadmap and authentication

Open **Roadmap**, enter your email, and follow the Supabase magic link. Return to Roadmap after sign-in. `GET /roadmap` and `PATCH /roadmap/{milestone_key}` require `Authorization: Bearer <Supabase access token>`. The backend validates that token with the Supabase Auth server before reading or changing progress. The frontend supplies the saved public Codeforces handle as an optional `handle` query parameter so available skill estimates can influence the next ready milestone; progress itself belongs to the signed-in user. `PATCH` accepts `{"completed":true}` or `{"completed":false}`. Locked milestones cannot be completed, and completed prerequisites cannot be reopened while completed descendants depend on them.

The twelve milestones and their prerequisite graph are versioned in `backend/app/roadmap_engine.py`. Codeforces has direct tags for some topics. Arrays, hashing, recursion, linked lists, stacks, and queues use broader tag proxies; the UI labels those estimates as proxies. Missing proficiency evidence leaves a milestone's score blank and does not block progress once prerequisites are complete.

The backend spaces official API calls by at least 2.1 seconds in its single process and retries transient failures up to three times. Deploy one API worker for this in-process limiter; multiple workers require a shared limiter. The problem catalog refreshes at most once every 24 hours. The integration uses only Codeforces' [public API methods](https://codeforces.com/apiHelp/methods) and does not request source code. Codeforces routes remain public and contain only public data; roadmap progress routes require Supabase Auth.

## Development commands

| Command | Action |
| --- | --- |
| `make dev-api` | Start FastAPI with reload on port 8000. |
| `make dev-web` | Start Vite on port 5173. |
| `make contract` | Export FastAPI OpenAPI to `shared/openapi.json` and regenerate `frontend/src/generated/api.ts`. Run after changing response models or routes. |
| `make lint` | Run Ruff and ESLint. |
| `make test` | Run backend route tests. |
| `make build` | Type-check and build the frontend. |

The backend is the source of truth for the API contract. The frontend imports generated response types from `frontend/src/generated/api.ts`. Commit both generated files when the API changes.

## Deployment

- Vercel: use `frontend` as the root directory, `npm run build` as the build command, and `dist` as the output directory. Set `VITE_API_BASE_URL` to the hosted FastAPI origin.
- FastAPI: build `backend/Dockerfile` on an independent container host. Set `FRONTEND_ORIGIN` to the exact Vercel origin and provide `DATABASE_URL` as a server-side secret.
- Apply both SQL migrations in order. The readiness check runs only `SELECT 1`; it does not verify migrations. Configure the production Vercel origin in Supabase Auth redirect URLs and set matching public/backend Supabase variables.

AI feedback, when implemented, will be advisory and may be incorrect. Tests use mocked Codeforces responses and do not verify a live account or network connection.
