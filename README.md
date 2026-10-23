# AlgoMentor AI

AlgoMentor AI is a DSA and competitive programming coach. It imports **public** Codeforces history, estimates topic proficiency from deterministic evidence, recommends unsolved problems, tracks a prerequisite-based roadmap, and gives advisory AI feedback on code a user pastes. The MVP is designed for an end-term demo on October 27, 2026.

## Problem and scope

Coding practice is scattered across problem archives, spreadsheets, and personal notes. A learner can see individual Codeforces submissions but has little guidance on weak topics, an appropriate next problem, or a structured path through prerequisites. AlgoMentor AI turns a public history into explainable coaching while letting signed-in users save roadmap progress and code reviews.

The app uses the official public Codeforces API. It does not scrape private submissions, fetch source code, execute pasted code, or claim that an AI review proves correctness. Topic scores require enough evidence and remain blank when history is sparse or incomplete.

## Stack and architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Frontend | React, Vite, Tailwind CSS, Recharts | Responsive dashboard and charts |
| Backend | FastAPI, SQLAlchemy, psycopg | Validation, integrations, scoring, recommendations, persistence |
| Database and sign-in | Supabase PostgreSQL and Supabase Auth | Public import tables and user-owned progress/reviews |
| External services | Official Codeforces API; Gemini or OpenAI | Public coding history and structured review feedback |
| Hosting | Vercel frontend; Render Docker web service | Independent static frontend and Python API |

```text
Browser ── public reads and Supabase bearer token ──> FastAPI ──> Supabase PostgreSQL
   │                                              ├──> Supabase Auth token check
   │                                              ├──> Codeforces public API
   │                                              └──> Gemini or OpenAI (server-side key)
   └── Vercel static assets                         Render web service
```

Codeforces imports are keyed by public handle, while roadmap and review records are keyed by a verified Supabase Auth user ID. FastAPI is the only application path to PostgreSQL; all three SQL migrations enable row-level security without browser table policies. The architecture and deterministic scoring details are in [docs/architecture.md](docs/architecture.md).

## Main user flows

1. **Import history:** Enter a Codeforces handle on Overview. `POST /codeforces/sync` validates it, imports public profile, submissions, and problem metadata, deduplicates submissions, and stores a cursor when more pages remain. The dashboard shows actual distinct solves and a topic chart.
2. **Assess skills:** The backend computes unique attempts and solves, rated difficulty, observable failures, and recent performance per topic. It returns components, weights, rationale, and confidence. A score is omitted until the import is complete and a topic has at least five attempted problems, three solves, and two rated solves.
3. **Find problems:** Recommendations exclude stored solved problems and rank eligible catalog problems by weak topic, rating fit, prerequisite readiness, and diversity. Each recommendation links to Codeforces and exposes its feature contributions. Incomplete or unverifiable history withholds recommendations.
4. **Follow the roadmap:** Sign in with a Supabase email magic link. Twelve DSA/CP milestones unlock when prerequisites are complete; completion is saved per account. Available Codeforces evidence influences the next ready milestone.
5. **Review code:** Sign in, paste your own Python, C++, or Java solution, and optionally add saved Codeforces problem metadata and notes. The backend sends text to the configured provider, validates the structured JSON feedback, and saves review history. Feedback is advisory and the code is never executed.

## API contract

| Method and path | Purpose | Auth |
| --- | --- | --- |
| `GET /health` | Process liveness | No |
| `GET /health/ready` | PostgreSQL connection and required-table check | No |
| `POST /codeforces/sync` | Import or continue a public handle | No |
| `GET /codeforces/users/{handle}/summary` | Saved profile, solves, topic counts | No |
| `GET /codeforces/users/{handle}/skills` | Explainable topic estimates | No |
| `GET /codeforces/users/{handle}/recommendations` | Ranked unsolved problems | No |
| `GET /roadmap`, `PATCH /roadmap/{key}` | Milestones and saved completion | Supabase bearer token |
| `POST /reviews`, `GET /reviews`, `GET /reviews/{id}` | Create and read saved AI reviews | Supabase bearer token |

FastAPI is the contract source. `make contract` exports `shared/openapi.json` and generates `frontend/src/generated/api.ts`; commit both after API changes. Interactive endpoint documentation is available at `/docs` on the backend.

## Local setup

Requirements: Node.js 20.19+ or 22.12+, npm 10+, Python 3.10+, `make`, a Supabase project, and a Gemini or OpenAI key to enable reviews.

1. Install backend dependencies from the repository root:

   ```bash
   cd backend
   python3 -m venv .venv
   .venv/bin/pip install -e '.[dev]'
   cp -n .env.example .env
   cd ..
   ```

   If `backend/.env` already exists, keep it and edit it; do not overwrite it with the example.

2. In `backend/.env`, set `DATABASE_URL` to the **Session pooler** URI copied from your Supabase project's **Connect** dialog, port 5432. It is the IPv4 option when the direct database endpoint cannot be reached over IPv6. Keep the pooler host and `postgres.<project-ref>` username exactly as shown. Change the scheme to `postgresql+psycopg://`, URL-encode reserved password characters, and add `sslmode=require`. `backend/.env` is loaded relative to the backend source file, so the launch directory does not affect it.

3. In Supabase's SQL Editor, run these existing migrations **in order**: `backend/migrations/001_codeforces.sql`, `002_roadmap.sql`, and `003_code_reviews.sql`. There is no Alembic setup and tables are not created on app startup. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `backend/.env`. Enable Email Auth and allow `http://localhost:5173` as a redirect URL in Supabase Auth settings.

4. To enable reviews, set `AI_PROVIDER=gemini` with `GEMINI_API_KEY`, or `AI_PROVIDER=openai` with `OPENAI_API_KEY`, in `backend/.env`. `GEMINI_MODEL` and `OPENAI_MODEL` select a model that supports structured JSON output. Keep all provider keys on the backend.

5. Install frontend dependencies and configure its public values:

   ```bash
   cd frontend
   npm ci
   cp -n .env.example .env.local
   cd ..
   ```

   Set `VITE_API_BASE_URL=http://localhost:8000`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local`. Only public configuration belongs in `VITE_` variables. Never put `DATABASE_URL`, provider keys, or a Supabase service-role key there.

6. Start both services in separate terminals:

   ```bash
   make dev-api
   ```

   ```bash
   make dev-web
   ```

   Open `http://localhost:5173`. Check `http://localhost:8000/health` and `http://localhost:8000/health/ready`. Readiness returns 200 only when PostgreSQL accepts the connection and all five required tables exist. A 503 response has a safe reason such as `dns_failure`, `authentication_failed`, or `missing_tables`; it does not include credentials. Restart FastAPI after changing backend environment values.

## Environment variables

| File or host | Variable | Meaning |
| --- | --- | --- |
| Backend only | `DATABASE_URL` | Supabase PostgreSQL Session pooler URI; secret |
| Backend only | `FRONTEND_ORIGIN` | Exact allowed Vercel or local origin for CORS |
| Backend | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Auth token verification |
| Backend only | `AI_PROVIDER`, `GEMINI_MODEL`, `OPENAI_MODEL` | Provider and model selection |
| Backend only | `GEMINI_API_KEY` or `OPENAI_API_KEY` | Provider secret |
| Vercel/frontend | `VITE_API_BASE_URL` | Public FastAPI origin |
| Vercel/frontend | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase Auth configuration |

`backend/.env` and `frontend/.env.local` are gitignored. The Docker build context excludes local environment files and virtual environments. Review source code is stored in PostgreSQL and sent to the chosen AI provider, so submit only code you are authorized to share.

## Deployment

1. Apply migrations 001–003 in the Supabase SQL Editor. Copy the Session pooler URI from Supabase Connect. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) explains direct IPv6 and pooler IPv4 endpoints.
2. Create a Render Blueprint from this repository's root `render.yaml`. It builds `backend/Dockerfile` with `backend` as Docker context and checks `/health/ready`. Set the prompted `DATABASE_URL`, `FRONTEND_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `GEMINI_API_KEY` in Render. The Blueprint defaults to Gemini; for OpenAI, set `AI_PROVIDER=openai` and `OPENAI_API_KEY` in Render instead. The Docker command binds to Render's `PORT` and runs one worker, preserving the in-process Codeforces request limiter. [Render Blueprint reference](https://render.com/docs/blueprint-spec).
3. Create a Vercel project from this repository with **Root Directory `frontend`**. `frontend/vercel.json` configures the Vite build, `dist` output, and SPA rewrites. Set `VITE_API_BASE_URL` to the HTTPS Render origin, and set the two public `VITE_SUPABASE_*` values. Redeploy after changing `VITE_` variables because Vite embeds them at build time. [Vercel Vite guide](https://vercel.com/docs/frameworks/frontend/vite).
4. Set Render `FRONTEND_ORIGIN` to the exact production Vercel origin and redeploy the backend. Add that origin to Supabase Auth's allowed redirect URLs. Test `/health/ready`, a public Codeforces sync, email sign-in, a roadmap update, and a review on the deployed URLs before presenting the demo.

Only the production Vercel origin is allowed by the current single-origin CORS setting; preview URLs need their own configured origin or a deliberate CORS change. Render health checks will fail until the database is reachable and migrations are applied.

## Development and verification

| Command | Action |
| --- | --- |
| `make dev-api` / `make dev-web` | Start local FastAPI / Vite |
| `make contract` | Regenerate OpenAPI and TypeScript types |
| `make test` | Backend unit and mocked integration tests |
| `make lint` | Ruff and ESLint |
| `make build` | Type-check and build frontend |

The tests use mocked Codeforces and AI responses; they are never presented as live data. Route tests exercise persistence across SQLAlchemy sessions with SQLite fixtures. Live PostgreSQL, Supabase Auth, provider calls, and hosted deployment must be checked with real configuration. The backend retries transient Codeforces and AI failures. The Codeforces limiter is process-local, so the Render configuration uses one API worker.

See [docs/demo.md](docs/demo.md) for a 3–5 minute walkthrough and an honest fallback if a live dependency is unavailable.
