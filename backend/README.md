# Backend (FastAPI) Foundation

This backend provides the minimal API foundation for:

- session creation
- pairwise evaluation logging
- basic diagnosis aggregation

## Run

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for Swagger UI.

## API Routes

- `GET /api/v1/health`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions/{session_id}`
- `POST /api/v1/sessions/{session_id}/selections`
- `GET /api/v1/sessions/{session_id}/diagnosis`
- `GET /api/v1/sessions/{session_id}/bo/next`
- `POST /api/v1/sessions/{session_id}/bo/feedback`
- `POST /api/v1/sessions/{session_id}/render-payload`
- `GET /api/v1/sessions/{session_id}/render-payload`

## Notes

- Current persistence is in-memory (PoC). Restarting server clears data.
- Replace `InMemorySessionStore` with DB-backed repository in next phase.
