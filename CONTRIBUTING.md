# Contributing

## Local development

Backend (Python 3.12+):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .\.venv\Scripts\Activate.ps1
pip install -e .[dev]                 # or: uv sync
cp .env.example .env                  # then edit secrets
alembic upgrade head
uvicorn app.main:app --reload --port 18000
```

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev
```

## Quality gates (run before committing)

Backend:

```bash
cd backend
ruff check .
ruff format --check .
pytest
```

Frontend:

```bash
cd frontend
npm run typecheck
npm run lint
npm run format:check
```

## Conventions

- Norwegian for user-facing strings; English for code, comments, log messages, and docs.
- Follow existing patterns in `app/api/*.py` for new endpoints (routers, response_model, status codes).
- Pydantic models live in `app/schemas/`. Add new ones to the matching domain module and re-export in `__init__.py`.
- Database changes go through Alembic: `alembic revision --autogenerate -m "..."`.
- Never commit `.env`, `*.db`, or anything under `backend/uploads/` (already covered by `.gitignore`).
