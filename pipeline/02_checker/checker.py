"""
ChainIQ Module 02 – Request Checker & Aggregator
=================================================

Receives intake-validated requests from Module 01, runs threshold
checks (delivery lead-time D, capacity C), flags warnings with a
PDF report for procurement officer review, and aggregates passing
requests by (category_l1, category_l2) every T seconds.

Usage:
    python checker.py                          # interactive / default
    python checker.py requests.json            # process a file
    python checker.py -D 14 -C 0 -T 30 *.json # custom thresholds

Dependencies:
    pip install fpdf2
"""

from __future__ import annotations

import argparse
import csv
import itertools
import json
import re
import threading
import time
from collections import defaultdict
from datetime import datetime, date, timezone
from pathlib import Path

from fpdf import FPDF

# ── Paths ──────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # repo root
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"

# ═══════════════════════════════════════════════════════════════
# GLOBAL THRESHOLDS (overridable via CLI)
# ═══════════════════════════════════════════════════════════════
D: int = 14       # minimum lead-time days
C: int = 0        # capacity override (0 = use per-category max)
T: int = 30       # aggregation interval in seconds

# ═══════════════════════════════════════════════════════════════
# COUNTERS — thread-safe via itertools.count (atomic in CPython)
# ═══════════════════════════════════════════════════════════════
_ink_counter = itertools.count(1)
_req_counter = itertools.count(1)


def _next_ink_id() -> str:
    return f"INK-{next(_ink_counter):06d}"


def _next_req_id() -> str:
    return f"REQ-{next(_req_counter):06d}"


# ═══════════════════════════════════════════════════════════════
# SUPPLIER CAPACITY MAP  (loaded once from suppliers.csv)
# ═══════════════════════════════════════════════════════════════
_capacity_map: dict[str, int] = {}


def _load_capacity_map() -> None:
    """Read suppliers.csv and keep the max capacity_per_month per (l1, l2)."""
    global _capacity_map
    csv_path = DATA_DIR / "suppliers.csv"
    if not csv_path.exists():
        print(f"[WARN] suppliers.csv not found at {csv_path}, capacity checks disabled.")
        return
    with open(csv_path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            key = f"{row['category_l1']}|{row['category_l2']}"
            cap = int(row.get("capacity_per_month", 0) or 0)
            if cap > _capacity_map.get(key, 0):
                _capacity_map[key] = cap


def get_capacity(l1: str, l2: str) -> int:
    """Return the effective capacity for a category pair."""
    if C > 0:
        return C
    return _capacity_map.get(f"{l1}|{l2}", 999_999)


# ═══════════════════════════════════════════════════════════════
# THRESHOLD CHECK
# ═══════════════════════════════════════════════════════════════

def check_thresholds(req: dict) -> list[dict]:
    """Return a list of issue dicts (empty → passes)."""
    issues: list[dict] = []
    today = date.today()

    # -- Lead-time check --
    try:
        rbd = date.fromisoformat(req["required_by_date"])
    except (KeyError, ValueError):
        rbd = None

    if rbd is not None:
        days_left = (rbd - today).days
        if days_left < D:
            issues.append({
                "type": "urgent_delivery",
                "message": (
                    f"Delivery date too tight: {days_left} day(s) remaining, "
                    f"minimum required is {D} days."
                ),
                "detail": (
                    f"Required by {req['required_by_date']} — only {days_left} "
                    f"day(s) from today ({today.isoformat()}). "
                    f"Request needs review by a Procurement Officer."
                ),
            })

    # -- Capacity check --
    qty = req.get("quantity") or 0
    if qty > 0:
        cap = get_capacity(req.get("category_l1", ""), req.get("category_l2", ""))
        if qty > cap:
            issues.append({
                "type": "excess_capacity",
                "message": (
                    f"Quantity {qty} exceeds max supplier capacity of {cap} "
                    f"for {req.get('category_l1')} > {req.get('category_l2')}."
                ),
                "detail": (
                    f"Requested {qty} {req.get('unit_of_measure', 'unit')}(s) but "
                    f"the maximum monthly supplier capacity is {cap}. "
                    f"Request needs review by a Procurement Officer."
                ),
            })

    return issues


# ═══════════════════════════════════════════════════════════════
# PDF WARNING REPORT
# ═══════════════════════════════════════════════════════════════

def generate_warning_pdf(req: dict, issues: list[dict], out_path: Path) -> Path:
    """Create a PDF report for procurement officer review."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # ── Header ──
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(230, 57, 70)
    pdf.cell(0, 12, "REVIEW REQUIRED", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(30, 30, 50)
    pdf.cell(0, 10, "Procurement Review Request", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(
        0, 6,
        "This request has been flagged and requires review by a Procurement Officer.",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(6)

    # ── Request details table ──
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(30, 30, 50)
    pdf.cell(0, 8, "Request Details", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    fields = [
        ("Intake ID", req.get("intake_id", "N/A")),
        ("Received At", req.get("received_at", "N/A")),
        ("Business Unit", req.get("business_unit", "N/A")),
        ("Category", f"{req.get('category_l1', '')} > {req.get('category_l2', '')}"),
        ("Quantity", f"{req.get('quantity', 'N/A')} {req.get('unit_of_measure', '')}"),
        ("Required By", req.get("required_by_date", "N/A")),
        ("Delivery Address", req.get("delivery_address", "N/A")),
        ("Preferred Supplier", req.get("preferred_supplier") or "None"),
    ]

    pdf.set_font("Helvetica", "", 10)
    for label, value in fields:
        pdf.set_fill_color(241, 250, 238)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(55, 7, label, border=1, fill=True)
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 7, str(value), border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(4)

    # ── Description ──
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Description", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(50, 50, 50)
    pdf.multi_cell(0, 5, req.get("request_text", "(no description)"))
    pdf.ln(4)

    # ── Issues ──
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(30, 30, 50)
    pdf.cell(0, 8, "Issues Detected", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    for iss in issues:
        pdf.set_fill_color(255, 243, 205)
        pdf.set_draw_color(255, 193, 7)
        pdf.set_font("Helvetica", "B", 10)
        label = "Urgent Delivery" if iss["type"] == "urgent_delivery" else "Excess Capacity"
        pdf.cell(0, 7, label, border=1, fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(80, 80, 80)
        pdf.multi_cell(0, 5, iss["message"])
        pdf.set_font("Helvetica", "I", 9)
        pdf.multi_cell(0, 5, iss["detail"])
        pdf.ln(3)

    # ── Required Action ──
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(30, 30, 50)
    pdf.cell(0, 8, "Required Action", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(50, 50, 50)
    pdf.multi_cell(0, 5, (
        "A Procurement Officer must review this request and either:\n"
        "  - Approve the request with an exception justification\n"
        "  - Request revision from the requester (adjust date or quantity)\n"
        "  - Reject the request with rationale"
    ))
    pdf.ln(6)

    # ── Footer ──
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(160, 160, 160)
    pdf.cell(
        0, 5,
        f"Generated by ChainIQ Module 02 (Checker) -- "
        f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} -- "
        f"{req.get('intake_id', '')}",
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out_path))
    return out_path


# ═══════════════════════════════════════════════════════════════
# OUTPUT RECORD BUILDERS
# ═══════════════════════════════════════════════════════════════

def _extract_budget(text: str | None) -> float | None:
    """Try to extract a budget figure from free text."""
    if not text:
        return None
    m = re.search(r"(?:budget|CHF|EUR|USD)\s*[:.\-]?\s*([\d,.']+)", text, re.IGNORECASE)
    if m:
        cleaned = m.group(1).replace(",", "").replace("'", "")
        try:
            return float(cleaned)
        except ValueError:
            pass
    return None


def build_single_output(req: dict) -> dict:
    """Build a 02_checker output record from a single intake request."""
    tags: list[str] = []
    notes: list[str] = []

    if not req.get("quantity"):
        tags.append("missing_info")
        notes.append("Quantity is missing from structured field.")

    budget = _extract_budget(req.get("request_text"))
    if budget:
        notes.append(f"Budget extracted from request_text: {budget} CHF")

    if not tags:
        tags.append("standard")

    return {
        "request_id": _next_req_id(),
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "business_unit": req.get("business_unit"),
        "category_l1": req.get("category_l1"),
        "category_l2": req.get("category_l2"),
        "request_text": req.get("request_text"),
        "quantity": req.get("quantity"),
        "unit_of_measure": req.get("unit_of_measure"),
        "budget_amount": budget,
        "required_by_date": req.get("required_by_date"),
        "preferred_supplier_mentioned": req.get("preferred_supplier"),
        "incumbent_supplier": None,
        "delivery_address": req.get("delivery_address"),
        "scenario_tags": tags,
        "aggregated_from": None,
        "intake_id": req.get("intake_id"),
        "checker_notes": notes or None,
    }


def build_aggregated_output(batch: list[dict]) -> dict:
    """Merge multiple same-category intake requests into one output record."""
    primary = batch[0]
    intake_ids = [r["intake_id"] for r in batch]
    total_qty = sum(r.get("quantity") or 0 for r in batch)
    valid_dates = [r["required_by_date"] for r in batch if r.get("required_by_date")]
    earliest_date = min(valid_dates) if valid_dates else None
    combined_text = "\n---\n".join(
        f"[{r['intake_id']}] {r.get('request_text', '')}" for r in batch
    )

    suppliers = list({r["preferred_supplier"] for r in batch if r.get("preferred_supplier")})
    addresses = list({r["delivery_address"] for r in batch if r.get("delivery_address")})

    total_budget: float | None = None
    for r in batch:
        b = _extract_budget(r.get("request_text"))
        if b is not None:
            total_budget = (total_budget or 0) + b

    tags = ["aggregated"]
    if total_qty == 0:
        tags.append("missing_info")

    notes = [
        f"Aggregated {len(batch)} requests for "
        f"{primary.get('category_l1')} > {primary.get('category_l2')}",
        f"Intake IDs merged: {', '.join(intake_ids)}",
        f"Combined quantity: {total_qty} {primary.get('unit_of_measure', 'unit')}(s)",
        f"Earliest required_by_date used: {earliest_date}",
    ]
    if total_budget is not None:
        notes.append(f"Combined budget extracted: {total_budget} CHF")

    return {
        "request_id": _next_req_id(),
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "business_unit": primary.get("business_unit"),
        "category_l1": primary.get("category_l1"),
        "category_l2": primary.get("category_l2"),
        "request_text": combined_text,
        "quantity": total_qty or None,
        "unit_of_measure": primary.get("unit_of_measure"),
        "budget_amount": total_budget,
        "required_by_date": earliest_date,
        "preferred_supplier_mentioned": "; ".join(suppliers) if suppliers else None,
        "incumbent_supplier": None,
        "delivery_address": "; ".join(addresses),
        "scenario_tags": tags,
        "aggregated_from": intake_ids,
        "intake_id": intake_ids[0],
        "checker_notes": notes,
    }


# ═══════════════════════════════════════════════════════════════
# AGGREGATION BUFFER
# ═══════════════════════════════════════════════════════════════

class AggregationBuffer:
    """Thread-safe buffer that accumulates requests and flushes
    every T seconds, grouping by (category_l1, category_l2)."""

    def __init__(self, interval: int):
        self._interval = interval
        self._queue: list[dict] = []
        self._lock = threading.Lock()
        self._outputs: list[dict] = []
        self._warnings: list[dict] = []
        self._timer: threading.Timer | None = None
        self._running = False

    # ── Public API ────────────────────────────────────────────

    def start(self) -> None:
        self._running = True
        self._schedule_flush()

    def stop(self) -> None:
        self._running = False
        if self._timer:
            self._timer.cancel()
        # Final flush of anything remaining
        self._flush()

    def submit(self, req: dict) -> None:
        """Submit an intake request. Checks thresholds, routes to
        warning (with PDF) or aggregation queue."""
        # Work on a copy to avoid mutating the caller's dict
        req = {**req}
        # Ensure intake metadata
        if "intake_id" not in req or not req["intake_id"]:
            req["intake_id"] = _next_ink_id()
        if "received_at" not in req or not req["received_at"]:
            req["received_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        issues = check_thresholds(req)

        if issues:
            # ── FLAGGED: generate PDF, store warning ──
            pdf_name = f"warning_{req['intake_id']}.pdf"
            pdf_path = OUTPUT_DIR / "warnings" / pdf_name
            generate_warning_pdf(req, issues, pdf_path)

            self._warnings.append({
                "intake_id": req["intake_id"],
                "issues": issues,
                "pdf_report": str(pdf_path),
            })

            print(f"  [WARNING] {req['intake_id']} flagged:")
            for iss in issues:
                print(f"            - {iss['message']}")
            print(f"            PDF report: {pdf_path}")
        else:
            # ── PASSES: add to aggregation queue ──
            with self._lock:
                self._queue.append(req)
            print(f"  [OK]      {req['intake_id']} added to aggregation queue "
                  f"({req.get('category_l1')} > {req.get('category_l2')})")

    @property
    def outputs(self) -> list[dict]:
        return list(self._outputs)

    @property
    def warnings_list(self) -> list[dict]:
        return list(self._warnings)

    @property
    def queue_size(self) -> int:
        with self._lock:
            return len(self._queue)

    # ── Internal ──────────────────────────────────────────────

    def _schedule_flush(self) -> None:
        if not self._running:
            return
        self._timer = threading.Timer(self._interval, self._on_timer)
        self._timer.daemon = True
        self._timer.start()

    def _on_timer(self) -> None:
        self._flush()
        self._schedule_flush()

    def _flush(self) -> None:
        with self._lock:
            batch = list(self._queue)
            self._queue.clear()

        if not batch:
            return

        # Group by (l1, l2)
        groups: dict[str, list[dict]] = defaultdict(list)
        for req in batch:
            key = f"{req.get('category_l1', '')}|{req.get('category_l2', '')}"
            groups[key].append(req)

        new_records: list[dict] = []
        for _key, reqs in groups.items():
            if len(reqs) == 1:
                new_records.append(build_single_output(reqs[0]))
            else:
                new_records.append(build_aggregated_output(reqs))

        self._outputs.extend(new_records)

        print(f"\n  [AGGREGATE] Flushed {len(batch)} request(s) "
              f"-> {len(new_records)} output record(s):")
        for rec in new_records:
            agg = rec.get("aggregated_from")
            agg_info = f" (aggregated from {len(agg)})" if agg else ""
            print(f"              {rec['request_id']} "
                  f"{rec['category_l1']} > {rec['category_l2']}"
                  f"{agg_info}")

    def force_flush(self) -> None:
        """Manually trigger aggregation now."""
        self._flush()


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def process_file(filepath: str, buffer: AggregationBuffer) -> None:
    """Load a JSON file (single object or array) and submit each request."""
    with open(filepath, encoding="utf-8") as fh:
        data = json.load(fh)

    items = data if isinstance(data, list) else [data]
    print(f"\n>> Ingesting {len(items)} request(s) from {filepath}")
    for item in items:
        buffer.submit(item)


def save_output(buffer: AggregationBuffer) -> Path:
    """Write final output to JSON."""
    out_path = OUTPUT_DIR / "checker_output.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(buffer.outputs, fh, indent=2, ensure_ascii=False)
    return out_path


def main() -> None:
    global D, C, T

    parser = argparse.ArgumentParser(
        description="ChainIQ Module 02 – Request Checker & Aggregator",
    )
    parser.add_argument("files", nargs="*", help="JSON file(s) with intake requests")
    parser.add_argument("-D", type=int, default=14,
                        help="Min lead-time days before delivery (default: 14)")
    parser.add_argument("-C", type=int, default=0,
                        help="Capacity override; 0 = use per-category max (default: 0)")
    parser.add_argument("-T", type=int, default=30,
                        help="Aggregation interval in seconds (default: 30)")
    args = parser.parse_args()

    D = args.D
    C = args.C
    T = args.T

    print("=" * 60)
    print("  ChainIQ Module 02 – Request Checker & Aggregator")
    print("=" * 60)
    print(f"  D (min lead-time days) : {D}")
    print(f"  C (capacity override)  : {C if C > 0 else '0 (auto from suppliers.csv)'}")
    print(f"  T (aggregation interval): {T}s")
    print("=" * 60)

    # Load supplier capacity data
    _load_capacity_map()
    print(f"  Loaded capacity data for {len(_capacity_map)} category pairs.")

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Start aggregation buffer
    buffer = AggregationBuffer(interval=T)
    buffer.start()

    # Process input files
    if args.files:
        for fp in args.files:
            process_file(fp, buffer)

        # Wait one aggregation cycle, then flush remaining
        print(f"\n>> Waiting {T}s for aggregation cycle...")
        time.sleep(T + 1)
        buffer.force_flush()
    else:
        # Interactive mode: accept JSON from stdin
        print("\n  No input files provided. Entering interactive mode.")
        print("  Paste JSON requests (one per block), then empty line to submit.")
        print("  Type 'flush' to force aggregation, 'quit' to exit.\n")

        try:
            while True:
                line = input("checker> ").strip()
                if line.lower() == "quit":
                    break
                if line.lower() == "flush":
                    buffer.force_flush()
                    continue
                if not line:
                    continue

                # Try to accumulate a JSON block
                json_buf = line
                if not line.startswith("{") and not line.startswith("["):
                    print("  (expected JSON object or 'flush'/'quit')")
                    continue

                # Read until valid JSON
                while True:
                    try:
                        data = json.loads(json_buf)
                        break
                    except json.JSONDecodeError:
                        try:
                            next_line = input("...     ")
                            json_buf += "\n" + next_line
                        except EOFError:
                            break

                try:
                    data = json.loads(json_buf)
                    items = data if isinstance(data, list) else [data]
                    for item in items:
                        buffer.submit(item)
                except json.JSONDecodeError as e:
                    print(f"  Invalid JSON: {e}")
        except (EOFError, KeyboardInterrupt):
            pass

    # Stop and final flush
    buffer.stop()

    # Save output
    out_path = save_output(buffer)

    # Summary
    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    print(f"  Warnings (flagged) : {len(buffer.warnings_list)}")
    print(f"  Output records     : {len(buffer.outputs)}")
    print(f"  Output file        : {out_path}")
    if buffer.warnings_list:
        print("\n  Warning PDFs:")
        for w in buffer.warnings_list:
            print(f"    - {w['intake_id']}: {w['pdf_report']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
