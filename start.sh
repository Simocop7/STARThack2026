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
source .venv/bin/activate
echo -e "${GREEN}Installing Python dependencies...${NC}"
pip install -q -r backend/requirements.txt

# --- Setup Frontend ---
if [ ! -d frontend/node_modules ]; then
  echo -e "${GREEN}Installing frontend dependencies...${NC}"
  (cd frontend && npm install)
fi

# --- Start Backend ---
echo -e "${GREEN}Starting backend on http://localhost:8000${NC}"
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# --- Start Frontend ---
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
