"""FastAPI application for the Smart Procurement validation module."""

from __future__ import annotations

import os
import re
import time

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pydantic import BaseModel, Field

from api.data_loader import DataStore
from api.models import FormInput, ValidationResult
from api.pipeline import process_request
from api.voice_parser import parse_voice_transcript

app = FastAPI(title="Smart Procurement Validator", version="0.1.0")

# ---------------------------------------------------------------------------
# Simple in-memory rate limiter (no extra dependency)
# ---------------------------------------------------------------------------
_RATE_LIMIT_MAX_REQUESTS = int(os.environ.get("RATE_LIMIT_MAX_REQUESTS", "10"))
_RATE_LIMIT_WINDOW_SECONDS = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "60"))
_MAX_TRACKED_IPS = 10_000
_request_log: dict[str, list[float]] = {}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path == "/api/validate":
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window_start = now - _RATE_LIMIT_WINDOW_SECONDS

        # Prune old entries for this IP
        timestamps = _request_log.get(client_ip, [])
        timestamps = [t for t in timestamps if t > window_start]

        if len(timestamps) >= _RATE_LIMIT_MAX_REQUESTS:
            _request_log[client_ip] = timestamps
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please try again later."},
            )

        timestamps.append(now)
        _request_log[client_ip] = timestamps

        # Evict stale IPs when the dict grows too large
        if len(_request_log) > _MAX_TRACKED_IPS:
            stale_ips = [
                ip for ip, ts in _request_log.items()
                if not ts or ts[-1] <= window_start
            ]
            for ip in stale_ips:
                del _request_log[ip]

    return await call_next(request)

_allowed_origins = os.environ.get(
    "CORS_ORIGINS", "http://localhost:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.on_event("startup")
async def startup() -> None:
    DataStore.get()  # pre-load all data


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/validate", response_model=ValidationResult)
async def validate_request(form: FormInput) -> ValidationResult:
    return await process_request(form)


@app.get("/api/categories")
async def get_categories() -> dict:
    store = DataStore.get()
    return {"categories": store.category_index}


@app.get("/api/suppliers/search")
async def search_suppliers(q: str = "", category_l1: str = "", category_l2: str = "") -> dict:
    store = DataStore.get()
    results: list[dict] = []
    seen: set[str] = set()

    for s in store.suppliers:
        if s["supplier_id"] in seen:
            continue
        if category_l1 and s["category_l1"] != category_l1:
            continue
        if category_l2 and s["category_l2"] != category_l2:
            continue
        if q and q.lower() not in s["supplier_name"].lower():
            continue
        seen.add(s["supplier_id"])
        results.append({
            "supplier_id": s["supplier_id"],
            "supplier_name": s["supplier_name"],
        })

    return {"suppliers": results[:20]}


class VoiceInput(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=5000)
    language: str = "en"


@app.post("/api/parse-voice")
async def parse_voice(voice: VoiceInput) -> dict:
    """Parse a voice transcript into structured procurement form fields."""
    from datetime import date as date_mod

    today = date_mod.today().isoformat()
    result = await parse_voice_transcript(voice.transcript, voice.language, today)
    return result


@app.get("/api/requests")
async def get_requests() -> dict:
    store = DataStore.get()
    summaries = [
        {
            "request_id": r["request_id"],
            "title": r.get("title", ""),
            "category_l1": r.get("category_l1", ""),
            "category_l2": r.get("category_l2", ""),
            "country": r.get("country", ""),
            "scenario_tags": r.get("scenario_tags", []),
        }
        for r in store.requests
    ]
    return {"requests": summaries}


@app.get("/api/requests/{request_id}")
async def get_request(request_id: str) -> dict:
    if not re.match(r"^REQ-\d{1,10}$", request_id):
        raise HTTPException(status_code=400, detail="Invalid request ID format")
    store = DataStore.get()
    for r in store.requests:
        if r["request_id"] == request_id:
            return {"request": r}
    raise HTTPException(status_code=404, detail="Request not found")
