# AlgoMentor AI

An AI-assisted DSA and competitive programming coach. The MVP imports public Codeforces history, computes explainable topic proficiency, recommends unsolved problems, tracks a prerequisite-based roadmap, and reviews code pasted by its owner.

## Status

Milestone 1 is a runnable frontend/backend scaffold. Product workflows are planned in [docs/architecture.md](docs/architecture.md) and are not wired up yet. The UI makes a real request to the backend health endpoint; it does not display sample user data.

## Local setup

Requirements: Node.js 20.19+ or 22.12+, Python 3.10+.

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

In another terminal:

```bash
cd backend
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload
```

The frontend runs at `http://localhost:5173` and the API at `http://localhost:8000`. Open `http://localhost:8000/docs` for the API docs. The health endpoint does not require credentials. Other routes will require Supabase Auth once implemented.

## Configuration

See `frontend/.env.example` and `backend/.env.example`. Only `VITE_` variables are exposed to the browser. The database URL and AI provider keys must be set on the backend host, never in Vercel frontend variables.

## Deployment outline

- Vercel: set root directory to `frontend`, build command `npm run build`, output directory `dist`, and set the frontend environment variables.
- FastAPI: build `backend/Dockerfile` on an independent container host. Set `FRONTEND_ORIGIN` to the Vercel origin. The host must expose port 8000 and provide backend secrets.
- Supabase: apply versioned SQL migrations from `backend/migrations` before enabling authenticated routes. Migration files are part of the next milestone.

## Checks

```bash
cd frontend && npm run build
cd backend && pytest
```

AI feedback will be advisory and may be incorrect. The app will never fetch private submissions or execute pasted code.
