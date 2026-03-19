from __future__ import annotations

import io
import json
import re
import uuid
from dataclasses import dataclass
from typing import Any

from pypdf import PdfReader

from api.azure_client import get_azure_client


POLICY_ASPECTS: dict[str, dict[str, str]] = {
    # These ids must match the frontend `POLICY_ASPECTS` ids.
    "approval_thresholds": {
        "label": "Approval thresholds",
        "query": "Extract exact approval threshold rules and quote/approval tiers (min/max amounts, currencies, quotes_required, and who approves/deviation rules).",
    },
    "restricted_suppliers": {
        "label": "Restricted suppliers",
        "query": "Extract exact rules describing restricted suppliers, including supplier_id, applicable categories, and the geographic/value scope that triggers the restriction.",
    },
    "category_rules": {
        "label": "Category rules",
        "query": "Extract exact category rules, including rule_id, category_l1, category_l2, rule type, and the rule_text describing what compliance/review is required.",
    },
    "geography_rules": {
        "label": "Geography & residency",
        "query": "Extract exact geography/data-residency rules, including rule_id and the country/region scope and the rule_text.",
    },
    "escalation_rules": {
        "label": "Escalation logic",
        "query": "Extract exact escalation rules (rule_id, trigger, and who to escalate to, plus whether it is blocking).",
    },
    "capacity_checks": {
        "label": "Supplier capacity",
        "query": "Extract exact policy statements about supplier capacity checks (e.g., capacity per month, volume/capacity thresholds, and what to do if capacity is exceeded).",
    },
    "esg_requirements": {
        "label": "ESG requirements",
        "query": "Extract exact policy statements about ESG/sustainability requirements (e.g., ESG criteria, any thresholds, and how ESG impacts supplier eligibility).",
    },
    "audit_trail": {
        "label": "Audit-ready evidence",
        "query": "Extract exact policy statements about audit trail/evidence requirements (e.g., what to record: policies_checked, reasoning, approvals, next steps, and retention).",
    },
}


@dataclass
class PolicyDoc:
    doc_id: str
    name: str
    size_bytes: int
    uploaded_at_iso: str
    extracted_text: str


@dataclass
class PolicyChunk:
    chunk_id: str
    doc_id: str
    doc_name: str
    page_range_hint: str
    text: str


_SESSION_DOCS: list[PolicyDoc] = []
_SESSION_CHUNKS: list[PolicyChunk] = []


def _safe_json_loads(raw: str) -> dict[str, Any] | None:
    raw = raw.strip()
    # Try direct parse first.
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    # Fallback: extract first {...} blob.
    m = re.search(r"\{.*\}", raw, flags=re.S)
    if not m:
        return None
    try:
        parsed = json.loads(m.group(0))
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return None
    return None


def _chunk_text(text: str, doc_id: str, doc_name: str, page_range_hint: str) -> list[PolicyChunk]:
    # Heuristic chunking by ~1200 chars with overlap.
    # Keep it deterministic to make citations stable-ish.
    cleaned = re.sub(r"\n{3,}", "\n\n", text or "").strip()
    if not cleaned:
        return []

    chunks: list[PolicyChunk] = []
    approx_target = 1200
    overlap = 150

    start = 0
    i = 0
    while start < len(cleaned):
        end = min(len(cleaned), start + approx_target)
        chunk_text = cleaned[start:end].strip()
        if chunk_text:
            chunks.append(
                PolicyChunk(
                    chunk_id=f"ch_{doc_id}_{i}",
                    doc_id=doc_id,
                    doc_name=doc_name,
                    page_range_hint=page_range_hint,
                    text=chunk_text,
                )
            )
        if end >= len(cleaned):
            break
        start = max(0, end - overlap)
        i += 1

    return chunks


def _tokenize(query: str) -> list[str]:
    # Basic keyword extraction for lightweight retrieval (no embeddings).
    tokens = re.findall(r"[a-zA-Z0-9]{3,}", (query or "").lower())
    # Dedup while preserving order
    seen: set[str] = set()
    out: list[str] = []
    for t in tokens:
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out[:50]


def _retrieve_top_chunks(query: str, chunks: list[PolicyChunk], top_k: int = 6) -> list[PolicyChunk]:
    tokens = _tokenize(query)
    if not tokens:
        return chunks[:top_k]

    scored: list[tuple[int, PolicyChunk]] = []
    for ch in chunks:
        text_lower = (ch.text or "").lower()
        score = sum(1 for t in tokens if t in text_lower)
        if score > 0:
            scored.append((score, ch))

    if not scored:
        return chunks[:top_k]

    scored.sort(key=lambda x: x[0], reverse=True)
    # De-dup by chunk text prefix to avoid near-duplicates.
    picked: list[PolicyChunk] = []
    seen_prefix: set[str] = set()
    for _, ch in scored[: top_k * 2]:
        pref = (ch.text or "").strip()[:80]
        if pref in seen_prefix:
            continue
        seen_prefix.add(pref)
        picked.append(ch)
        if len(picked) >= top_k:
            break
    return picked


async def upload_policy_pdfs(files: list[tuple[str, bytes, int]]) -> dict[str, Any]:
    """
    Args:
      files: [(filename, content_bytes, size_bytes), ...]
    """
    global _SESSION_DOCS, _SESSION_CHUNKS
    _SESSION_DOCS = []
    _SESSION_CHUNKS = []

    docs: list[dict[str, Any]] = []

    for filename, content, size in files:
        doc_id = f"PDOC-{uuid.uuid4().hex[:8].upper()}"
        uploaded_at_iso = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()

        reader = PdfReader(io.BytesIO(content))
        full_text_parts: list[str] = []
        # Extract per page so we can hint page range.
        page_texts: list[str] = []
        for page_i, page in enumerate(reader.pages):
            try:
                t = page.extract_text() or ""
            except Exception:
                t = ""
            page_texts.append(t)
            full_text_parts.append(t)

        extracted_text = "\n\n".join(full_text_parts).strip()
        _SESSION_DOCS.append(
            PolicyDoc(
                doc_id=doc_id,
                name=filename,
                size_bytes=size,
                uploaded_at_iso=uploaded_at_iso,
                extracted_text=extracted_text,
            )
        )

        # Chunk per doc: use overall hint since we chunk by char positions.
        # Still keep a "page_range_hint" for user trust.
        page_range_hint = f"pages 1–{len(reader.pages)}"
        chunks = _chunk_text(extracted_text, doc_id=doc_id, doc_name=filename, page_range_hint=page_range_hint)
        _SESSION_CHUNKS.extend(chunks)

        docs.append(
            {
                "doc_id": doc_id,
                "name": filename,
                "size_bytes": size,
                "uploadedAtISO": uploaded_at_iso,
                "pages": len(reader.pages),
                "chunks": len(chunks),
            }
        )

    return {"docs": docs, "chunk_count": len(_SESSION_CHUNKS)}


async def rag_extract_policies(aspect_ids: list[str] | None) -> dict[str, Any]:
    if not _SESSION_CHUNKS:
        return {"extracted": {}, "error": "No policy PDFs uploaded in this session yet."}

    requested = aspect_ids or list(POLICY_ASPECTS.keys())
    # Keep only known aspects
    requested = [a for a in requested if a in POLICY_ASPECTS]

    # Build retrieval contexts per aspect (lightweight retrieval).
    contexts: dict[str, list[PolicyChunk]] = {}
    for aspect_id in requested:
        q = POLICY_ASPECTS[aspect_id]["query"]
        contexts[aspect_id] = _retrieve_top_chunks(q, _SESSION_CHUNKS, top_k=6)

    # Build a single prompt containing all contexts.
    # We keep it fairly compact by truncating each chunk.
    context_texts: list[str] = []
    for aspect_id in requested:
        context_texts.append(f"### Context for aspect: {aspect_id} ({POLICY_ASPECTS[aspect_id]['label']})")
        for ch in contexts[aspect_id]:
            snippet = (ch.text or "").strip()
            snippet = snippet[:9000]  # hard limit per chunk to keep prompt size bounded
            context_texts.append(
                f"- Source: {ch.doc_name} | {ch.page_range_hint} | {ch.chunk_id}\n{snippet}\n"
            )
        context_texts.append("\n")

    user_payload = "\n".join(context_texts)

    schema_hint = {k: {"clauses": ["string"]} for k in POLICY_ASPECTS.keys()}

    client = get_azure_client()
    deployment = __import__("os").environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

    prompt = (
        "You are extracting procurement governance policies from the provided document excerpts.\n"
        "Task:\n"
        "1) For each requested aspect_id, extract EXACT policy statements verbatim from the excerpts.\n"
        "2) Do NOT paraphrase. Keep numbers, thresholds, names, and rule text exactly as written.\n"
        "3) If no relevant policy statement exists in the excerpts for an aspect, return an empty list.\n"
        "4) Return ONLY valid JSON.\n"
        "5) The JSON MUST have top-level keys equal to each requested aspect_id.\n"
        "   Each key's value MUST be an object: {\"clauses\": [string, ...]}.\n\n"
        f"Requested aspect ids: {requested}\n\n"
        f"Expected JSON shape: {json.dumps(schema_hint)}\n\n"
        "Now the excerpts:\n"
        f"{user_payload}"
    )

    resp = await client.chat.completions.create(
        model=deployment,
        temperature=0.0,
        max_tokens=1400,
        messages=[
            {"role": "system", "content": "Return JSON only. No markdown."},
            {"role": "user", "content": prompt},
        ],
    )

    raw = resp.choices[0].message.content or "{}"
    parsed = _safe_json_loads(raw) or {}

    extracted: dict[str, Any] = {}
    for aspect_id in requested:
        val = parsed.get(aspect_id)
        if isinstance(val, dict):
            clauses = val.get("clauses", [])
            if isinstance(clauses, list):
                extracted[aspect_id] = {"clauses": [str(c) for c in clauses if c is not None]}
                continue
        extracted[aspect_id] = {"clauses": []}

    return {"extracted": extracted}

