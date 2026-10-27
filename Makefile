.PHONY: dev-api dev-web contract lint test build

dev-api:
	cd backend && .venv/bin/uvicorn app.main:app --reload

dev-web:
	cd frontend && npm run dev

contract:
	cd backend && .venv/bin/python scripts/export_openapi.py
	cd frontend && npm run contract:types

lint:
	cd backend && .venv/bin/ruff check app tests scripts
	cd frontend && npm run lint

test:
	cd backend && .venv/bin/pytest -q
	cd frontend && npm run test

build:
	cd frontend && npm run build
