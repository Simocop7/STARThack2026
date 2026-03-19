# ---- Stage 1: Build frontend ----
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN NODE_OPTIONS=--max-old-space-size=2048 npm run build

# ---- Stage 2: Python runtime ----
FROM python:3.13-slim
WORKDIR /app

# Install Python deps
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code + data
COPY api/ ./api/
COPY ChainIQ-START-Hack-2026-/ ./ChainIQ-START-Hack-2026-/

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8000

# Railway injects $PORT at runtime; fall back to 8000 for local Docker runs
ENV PORT=8000
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
