# Character Illustration Diagnostic & Reflection System

This repository is a creativity support tool for fan art / character illustration feedback.
The current implementation is focused on Phase 1:

- Browser-side PSD parsing (ag-psd)
- Layer extraction for face-related parts
- Canvas-based independent affine transform controls
- Session-link style evaluation scaffold
- Delta-style diagnosis dashboard scaffold

## Frontend Development

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

## Backend Development

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs.

## Current App Routes

- `/`: Creator setup + PSD debug workbench (Phase 1 core)
- `/evaluate`: Pairwise evaluation session scaffold
- `/aggregation-dashboard`: Delta diagnosis sheet scaffold

## Current API Routes

- `GET /api/v1/health`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions/{session_id}`
- `POST /api/v1/sessions/{session_id}/selections`
- `GET /api/v1/sessions/{session_id}/diagnosis`
- `GET /api/v1/sessions/{session_id}/bo/next?round_index=1&k=4`
- `POST /api/v1/sessions/{session_id}/bo/feedback`

## Notes

- PSD extraction relies on layer names such as `Face`, `Eye_L`, `Eye_R`, `Mouth`, `Outline`.
- This version intentionally avoids auto-fixing illustrations and keeps the human-in-the-loop workflow.
