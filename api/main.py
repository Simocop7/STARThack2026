"""FastAPI application for the Smart Procurement validation module."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.data_loader import DataStore
from api.models import FormInput, ValidationResult
from api.pipeline import process_request

app = FastAPI(title="Smart Procurement Validator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    store = DataStore.get()
    for r in store.requests:
        if r["request_id"] == request_id:
            return {"request": r}
    return {"error": "Not found"}
