# AlgoMentor AI

AlgoMentor AI is a DSA and competitive programming coach in development. This milestone provides a responsive dashboard shell, a FastAPI service, a Supabase PostgreSQL connection check, and a shared OpenAPI contract. It does not import coding history or display sample progress. The later product architecture is in [docs/architecture.md](docs/architecture.md).

## Prerequisites

- Node.js 20.19+ or 22.12+ and npm 10+
- Python 3.10+ and `make`
- Optional for a green database readiness check: a Supabase project with a PostgreSQL connection URI

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

2. Edit `backend/.env`. Replace `DATABASE_URL` with the Supabase **Session pooler** connection URI from the Supabase dashboard. Change the scheme from `postgresql://` to `postgresql+psycopg://` and add `?sslmode=require` (or `&sslmode=require` if the URI already has query parameters). URL-encode special characters in the password. The placeholder URI in `.env.example` is intentionally unusable. Keep this file local; it is gitignored. The Supabase URL and publishable key are reserved for the upcoming authentication milestone, so they can remain placeholders for now.

3. Install the frontend:

   ```bash
   cd frontend
   npm ci
   cp .env.example .env.local
   cd ..
   ```

   For local development, `VITE_API_BASE_URL=http://localhost:8000` is already set in the example. The `VITE_SUPABASE_*` values are reserved for the authentication milestone. Never put the database URL or an AI API key in a `VITE_` variable.

4. Start the API and frontend in separate terminals from the repository root:

   ```bash
   make dev-api
   ```

   ```bash
   make dev-web
   ```

5. Open `http://localhost:5173`. API docs are at `http://localhost:8000/docs`. Check liveness with `curl http://localhost:8000/health`; check the configured database with `curl -i http://localhost:8000/health/ready`. A 503 readiness response means the database URL is unset, still a placeholder, or unreachable. The dashboard shows a setup state in that case. It shows an error and Retry button if the API cannot be reached.

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
- Database tables and authenticated product routes are planned for the next milestone. The current readiness check runs only `SELECT 1`; it does not create tables.

AI feedback will be advisory and may be incorrect. The planned Codeforces integration will use only public API data.
