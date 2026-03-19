#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

cleanup() {
  echo ""
  echo -e "${GREEN}Shutting down...${NC}"
  kill "$BACKEND_PID" 2>/dev/null
  kill "$FRONTEND_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# --- Check .env ---
if [ ! -f .env ]; then
  echo -e "${RED}Missing .env file. Create it with Azure OpenAI credentials.${NC}"
  exit 1
fi

# --- Setup Python venv ---
if [ ! -d .venv ]; then
  echo -e "${GREEN}Creating Python virtual environment...${NC}"
  python3 -m venv .venv
fi
if [ -f .venv/bin/activate ]; then
  source .venv/bin/activate
elif [ -f .venv/Scripts/activate ]; then
  source .venv/Scripts/activate
else
  echo -e "${RED}Cannot find venv activate script${NC}"
  exit 1
fi
# Only install if fastapi is missing
if ! python -c "import fastapi" 2>/dev/null; then
  echo -e "${GREEN}Installing Python dependencies...${NC}"
  pip install --no-cache-dir -q -r backend/requirements.txt
else
  echo -e "${GREEN}Python dependencies already installed.${NC}"
fi

# --- Setup Frontend ---
if [ ! -d frontend/node_modules ]; then
  echo -e "${GREEN}Installing frontend dependencies...${NC}"
  (cd frontend && npm install)
fi

# --- Start Backend ---
echo -e "${GREEN}Starting backend on http://localhost:8000${NC}"
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# --- Start Frontend (Vite dev server with proxy) ---
echo -e "${GREEN}Starting frontend on http://localhost:5173${NC}"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}  App ready!${NC}"
echo -e "${GREEN}  Frontend: http://localhost:5173${NC}"
echo -e "${GREEN}  Backend:  http://localhost:8000${NC}"
echo -e "${GREEN}  Press Ctrl+C to stop${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""

wait
