# ChainIQ Sourcing Agent

Audit-ready autonomous sourcing prototype built for **STARThack 2026** (ChainIQ challenge).

---

## What this project does

This app converts unstructured procurement requests into structured, policy-aware supplier decisions.

It supports two roles:

- **Employee portal**: create a request (text + optional voice), review extracted fields, submit to procurement.
- **Procurement portal**: process inbox requests, validate policy constraints, rank suppliers, place orders, print receipts, manage policy docs.

Core output goals:

- Transparent reasoning
- Rule enforcement and escalation logic
- Explainable shortlist / exclusions
- Audit-friendly decision traces

---

## Quick start (recommended)

### 1) Prerequisites

- Python `>=3.13`
- Node.js `>=20`
- npm
- Azure OpenAI credentials

### 2) Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your Azure values:

```env
AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_OPENAI_API_KEY=your-api-key-here
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2025-01-01-preview

# Optional (only for TTS voice responses)
ELEVENLABS_API_KEY=

# Optional (if set, backend requires X-API-Key on protected /api routes)
APP_API_KEY=
```

### 3) Start backend + frontend

```bash
chmod +x start.sh
./start.sh
```

After startup:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Health check: `http://localhost:8000/api/health`

---

## Manual startup

Use this if you do not want the helper script.

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev -- --host
```

Vite proxies `/api` to `http://localhost:8000` in development (`frontend/vite.config.ts`).

---

## Main product flow

1. Employee submits request (`/api/employee/submit`).
2. Procurement opens request from inbox (`/api/employee/requests`).
3. Validation pipeline runs (`/api/validate`):
   - interpretation
   - completeness/consistency checks
   - policy-related issues + user-facing fixes
4. Supplier ranking runs (`/api/rank`):
   - deterministic filtering + scoring
   - policy checks and escalations
5. Procurement selects supplier and places order (`/api/order`).
6. Completed orders are stored and listed in Orders (`/api/orders`) and are printable.

---

## Key features implemented

- **Two-role UI**: Employee + Procurement workflows
- **Voice request support**: speech-to-text parsing and conversational follow-up flow
- **Supplier ranking UI**:
  - Top 3 by feature
  - Top 10 overall table
  - unified detail modal
- **Policy section**:
  - PDF upload
  - extracted clause display (RAG endpoint)
  - policy aspect toggles
- **Order lifecycle**:
  - recap -> confirmation -> printable receipt
  - persisted order list in office Orders section
- **Request history/inbox statuses**:
  - pending, processing, completed, refused

---

## API reference (important endpoints)

### Core

- `GET /api/health`
- `POST /api/validate`
- `POST /api/rank`
- `POST /api/rank/custom-weights`
- `POST /api/order`
- `GET /api/orders`

### Employee / inbox

- `POST /api/employee/submit`
- `GET /api/employee/requests`
- `PATCH /api/employee/requests/{emp_id}/status`

### Voice

- `POST /api/parse-voice`
- `POST /api/generate-followup`
- `POST /api/tts`

### Policies

- `POST /api/policies/upload`
- `POST /api/policies/extract`

### Data / catalog

- `GET /api/categories`
- `GET /api/suppliers/search`
- `GET /api/requests`
- `GET /api/requests/{request_id}`

---

## Project structure (high level)

```text
api/                      FastAPI app, ranking + validation orchestration
backend/                  Python dependency list (requirements.txt)
frontend/                 React + TypeScript + Tailwind UI
  src/components/         Portal views and workflows
  src/components/ui/      Reusable UI primitives/components
  e2e/                    Playwright end-to-end tests
tests/                    Python unit + integration tests
ChainIQ-START-Hack-2026-/data/
                          Challenge datasets (requests/suppliers/pricing/policies/history)
Dockerfile                Container build (serves frontend + backend)
railway.toml              Railway deployment config
start.sh                  One-command local startup
```

---

## Troubleshooting

### Backend does not start

- Ensure `.env` exists and Azure variables are valid.
- Check port conflicts on `8000`.
- Reinstall backend deps:

```bash
.venv/bin/pip install -r backend/requirements.txt
```

### Frontend cannot call backend

- Ensure backend is running on `http://localhost:8000`.
- Ensure frontend runs via Vite dev server (`npm run dev`) so proxy works.
- If `APP_API_KEY` is set, include header `X-API-Key` for API calls.

### Voice/TTS issues

- Browser mic permission must be allowed.
- `POST /api/tts` requires `ELEVENLABS_API_KEY`.

---

## Tech stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Vite 8, Framer Motion
- **Backend**: FastAPI, Pydantic v2, Uvicorn
- **AI**: Azure OpenAI (+ LangChain components where used)
- **Optional voice TTS**: ElevenLabs

---

## Data source

Challenge dataset:

- [ChainIQ-START-Hack-2026](https://github.com/adriank71/ChainIQ-START-Hack-2026-.git)

---

## Notes for judges / demo

A fast 5-minute demo path:

1. Employee creates a request (text or voice)
2. Procurement processes from inbox
3. Open supplier details + show policy issues/escalations
4. Place order and print receipt
5. Open Orders section and show persisted completed requests
