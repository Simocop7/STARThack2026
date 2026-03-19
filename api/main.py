"""FastAPI application for the Smart Procurement validation module."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime as dt
from datetime import timezone
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field, field_validator

from api.data_loader import DataStore
from api.elevenlabs_client import get_elevenlabs_client
from api.models import FormInput, ValidationResult
from api.pipeline import process_request
from api.ranking_models import (
    CleanOrderRecap,
    OrderConfirmation,
    OrderRequest,
    RankedSupplierOutput,
    ScoringWeights,
)
from api.ranking_orchestrator import get_top_5_suppliers
from api.voice_parser import parse_voice_transcript

load_dotenv()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    DataStore.get()  # pre-load all data
    yield
    client = get_elevenlabs_client()
    if client is not None:
        await client.close()


app = FastAPI(title="Smart Procurement Validator", version="0.1.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Simple in-memory rate limiter (no extra dependency)
# ---------------------------------------------------------------------------
_RATE_LIMIT_MAX_REQUESTS = int(os.environ.get("RATE_LIMIT_MAX_REQUESTS", "10"))
_RATE_LIMIT_WINDOW_SECONDS = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "60"))
_MAX_TRACKED_IPS = 10_000
_request_log: dict[str, list[float]] = {}
_rate_limit_lock = asyncio.Lock()


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path in (
        "/api/validate",
        "/api/tts",
        "/api/parse-voice",
        "/api/rank",
        "/api/rank/custom-weights",
        "/api/order",
    ):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window_start = now - _RATE_LIMIT_WINDOW_SECONDS

        async with _rate_limit_lock:
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
                stale_ips = [ip for ip, ts in _request_log.items() if not ts or ts[-1] <= window_start]
                for ip in stale_ips:
                    del _request_log[ip]

    return await call_next(request)


_allowed_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)


# ---------------------------------------------------------------------------
# Optional API key auth — enabled when APP_API_KEY env var is set
# ---------------------------------------------------------------------------
_APP_API_KEY = os.environ.get("APP_API_KEY")
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(key: str | None = Depends(_api_key_header)) -> None:
    """Reject requests with invalid API key when APP_API_KEY is configured."""
    if _APP_API_KEY is None:
        return  # auth not enabled — allow all requests (dev/demo mode)
    if key != _APP_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing API key")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post(
    "/api/validate",
    response_model=ValidationResult,
    dependencies=[Depends(verify_api_key)],
)
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
        results.append(
            {
                "supplier_id": s["supplier_id"],
                "supplier_name": s["supplier_name"],
            }
        )

    return {"suppliers": results[:20]}


_SUPPORTED_LANGUAGES = {"en", "fr", "de", "es", "pt", "it", "ja"}


class VoiceInput(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=5000)
    language: str = "en"

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        if v not in _SUPPORTED_LANGUAGES:
            return "en"
        return v


@app.post("/api/parse-voice", dependencies=[Depends(verify_api_key)])
async def parse_voice(voice: VoiceInput) -> dict:
    """Parse a voice transcript into structured procurement form fields."""
    from datetime import date as date_mod

    today = date_mod.today().isoformat()
    result = await parse_voice_transcript(voice.transcript, voice.language, today)
    return result


class TTSInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    language: str = "en"


@app.post("/api/tts", dependencies=[Depends(verify_api_key)])
async def text_to_speech(tts_input: TTSInput):
    """Convert text to speech using ElevenLabs. Returns audio/mpeg stream."""
    client = get_elevenlabs_client()
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="TTS service not configured. Set ELEVENLABS_API_KEY.",
        )

    async def audio_stream():
        async for chunk in client.text_to_speech(tts_input.text):
            yield chunk

    return StreamingResponse(
        audio_stream(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache"},
    )


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


# ── Supplier Ranking ───────────────────────────────────────────────


@app.post(
    "/api/rank",
    response_model=RankedSupplierOutput,
    dependencies=[Depends(verify_api_key)],
)
async def rank_suppliers(
    order: CleanOrderRecap,
    force_llm: bool = False,
) -> RankedSupplierOutput:
    """Rank suppliers for a clean order recap.

    Returns up to 5 scored suppliers with full audit trail.
    Set `force_llm=true` to always invoke the LLM fallback.
    """
    return await get_top_5_suppliers(order, force_llm=force_llm)


@app.post(
    "/api/rank/custom-weights",
    response_model=RankedSupplierOutput,
    dependencies=[Depends(verify_api_key)],
)
async def rank_suppliers_custom(
    order: CleanOrderRecap,
    weights: ScoringWeights,
    force_llm: bool = False,
) -> RankedSupplierOutput:
    """Rank suppliers with custom scoring weights."""
    return await get_top_5_suppliers(order, weights=weights, force_llm=force_llm)


# ── Order Placement ─────────────────────────────────────────────────────

# ── Employee Request Store ───────────────────────────────────────────────────

_employee_requests: list[dict] = []


class EmployeeFormInput(BaseModel):
    request_text: str = Field(..., min_length=1, max_length=10000)
    quantity: int | None = None
    unit_of_measure: str | None = None
    category_l1: str | None = None
    category_l2: str | None = None
    delivery_address: str | None = None
    required_by_date: str | None = None
    preferred_supplier: str | None = None
    language: str = "en"
    validated: bool = False
    enriched_data: dict | None = None


@app.post("/api/employee/submit")
async def submit_employee_request(req: EmployeeFormInput) -> dict:
    """Store an employee procurement request for the office to process.

    If `validated=true`, the request has passed validation and includes
    enriched data from the LLM interpretation step.
    """
    emp_id = f"EMP-{uuid.uuid4().hex[:8].upper()}"
    record = {
        "id": emp_id,
        "submitted_at": dt.now(tz=timezone.utc).isoformat(),
        "status": "pending",
        "request_text": req.request_text,
        "quantity": req.quantity,
        "unit_of_measure": req.unit_of_measure or "",
        "category_l1": req.category_l1 or "",
        "category_l2": req.category_l2 or "",
        "delivery_address": req.delivery_address or "",
        "required_by_date": req.required_by_date or "",
        "preferred_supplier": req.preferred_supplier or "",
        "language": req.language,
        "validated": req.validated,
        "enriched_data": req.enriched_data,
    }
    _employee_requests.append(record)
    return {"request_id": emp_id, "status": "pending"}


@app.get("/api/employee/requests")
async def get_employee_requests() -> dict:
    """Return all submitted employee requests (newest first)."""
    return {"requests": list(reversed(_employee_requests))}


@app.patch("/api/employee/requests/{emp_id}/status")
async def update_employee_request_status(emp_id: str, status: str) -> dict:
    for r in _employee_requests:
        if r["id"] == emp_id:
            r["status"] = status
            return {"ok": True}
    raise HTTPException(status_code=404, detail="Request not found")


# ── Order Placement ─────────────────────────────────────────────────────


@app.post(
    "/api/order",
    response_model=OrderConfirmation,
    dependencies=[Depends(verify_api_key)],
)
async def place_order(order: OrderRequest) -> OrderConfirmation:
    """Record the procurement office's supplier selection and return a receipt."""

    order_id = f"ORD-{uuid.uuid4().hex[:8].upper()}"
    placed_at = dt.now(tz=timezone.utc)

    approval_required = order.approval_threshold_id is not None

    next_steps: list[str] = []
    if approval_required:
        next_steps.append(f"Obtain approval per threshold {order.approval_threshold_id}.")
    if order.quotes_required and order.quotes_required > 1:
        next_steps.append(f"Collect {order.quotes_required} competitive quote(s) before award.")
    next_steps.append(f"Issue purchase order to {order.selected_supplier_name} referencing {order_id}.")
    if order.required_by_date:
        next_steps.append(f"Confirm delivery commitment for {order.required_by_date.isoformat()} with supplier.")
    next_steps.append("Archive this confirmation and supplier ranking output for audit.")

    status = "pending_approval" if approval_required else "submitted"

    return OrderConfirmation(
        order_id=order_id,
        request_id=order.request_id,
        placed_at=placed_at,
        status=status,
        selected_supplier_id=order.selected_supplier_id,
        selected_supplier_name=order.selected_supplier_name,
        category_l1=order.category_l1,
        category_l2=order.category_l2,
        quantity=order.quantity,
        unit_of_measure=order.unit_of_measure,
        unit_price=order.unit_price,
        total_price=order.total_price,
        currency=order.currency,
        delivery_country=order.delivery_country,
        required_by_date=order.required_by_date,
        pricing_tier_applied=order.pricing_tier_applied,
        approval_required=approval_required,
        approval_threshold_id=order.approval_threshold_id,
        approval_threshold_note=order.approval_threshold_note,
        quotes_required=order.quotes_required,
        notes=order.notes,
        next_steps=next_steps,
    )
