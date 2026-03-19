"""Load and index all reference data at startup."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "ChainIQ-START-Hack-2026-" / "data"


def _read_csv(filename: str) -> list[dict[str, str]]:
    with open(DATA_DIR / filename, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _read_json(filename: str) -> Any:
    with open(DATA_DIR / filename, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

def load_categories() -> list[dict[str, str]]:
    """Return category taxonomy rows as-is."""
    return _read_csv("categories.csv")


def build_category_index(categories: list[dict]) -> dict[str, list[str]]:
    """Map category_l1 -> list of category_l2 values."""
    index: dict[str, list[str]] = {}
    for row in categories:
        index.setdefault(row["category_l1"], []).append(row["category_l2"])
    return index


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------

def load_suppliers() -> list[dict[str, Any]]:
    rows = _read_csv("suppliers.csv")
    for row in rows:
        row["service_regions"] = [r.strip() for r in row["service_regions"].split(";") if r.strip()]
        row["quality_score"] = int(row["quality_score"])
        row["risk_score"] = int(row["risk_score"])
        row["esg_score"] = int(row["esg_score"])
        row["preferred_supplier"] = row["preferred_supplier"] == "True"
        row["is_restricted"] = row["is_restricted"] == "True"
        row["data_residency_supported"] = row["data_residency_supported"] == "True"
        row["capacity_per_month"] = int(row["capacity_per_month"])
    return rows


def build_supplier_by_key(suppliers: list[dict]) -> dict[tuple[str, str, str], dict]:
    """Index by (supplier_id, category_l1, category_l2)."""
    return {
        (s["supplier_id"], s["category_l1"], s["category_l2"]): s
        for s in suppliers
    }


def build_supplier_by_name(suppliers: list[dict]) -> dict[str, str]:
    """Map supplier_name (lowered) -> supplier_id. Deduped (same name always same id)."""
    return {s["supplier_name"].lower(): s["supplier_id"] for s in suppliers}


def build_suppliers_by_category(suppliers: list[dict]) -> dict[tuple[str, str], list[dict]]:
    """Index by (category_l1, category_l2) -> list of supplier rows."""
    index: dict[tuple[str, str], list[dict]] = {}
    for s in suppliers:
        key = (s["category_l1"], s["category_l2"])
        index.setdefault(key, []).append(s)
    return index


# ---------------------------------------------------------------------------
# Pricing
# ---------------------------------------------------------------------------

def load_pricing() -> list[dict[str, Any]]:
    rows = _read_csv("pricing.csv")
    for row in rows:
        row["min_quantity"] = int(row["min_quantity"])
        row["max_quantity"] = int(row["max_quantity"])
        row["unit_price"] = float(row["unit_price"])
        row["moq"] = int(row["moq"])
        row["standard_lead_time_days"] = int(row["standard_lead_time_days"])
        row["expedited_lead_time_days"] = int(row["expedited_lead_time_days"])
        row["expedited_unit_price"] = float(row["expedited_unit_price"])
    return rows


def build_pricing_index(
    pricing: list[dict],
) -> dict[tuple[str, str, str, str], list[dict]]:
    """Index by (supplier_id, category_l1, category_l2, region) -> sorted tier list."""
    index: dict[tuple[str, str, str, str], list[dict]] = {}
    for row in pricing:
        key = (row["supplier_id"], row["category_l1"], row["category_l2"], row["region"])
        index.setdefault(key, []).append(row)
    for tiers in index.values():
        tiers.sort(key=lambda t: t["min_quantity"])
    return index


# ---------------------------------------------------------------------------
# Policies
# ---------------------------------------------------------------------------

def load_policies() -> dict[str, Any]:
    return _read_json("policies.json")


def normalize_policies(raw: dict) -> dict[str, Any]:
    """Normalize schema inconsistencies in policies.json."""
    # Normalize approval thresholds (USD uses different field names)
    thresholds = []
    for t in raw.get("approval_thresholds", []):
        thresholds.append({
            "threshold_id": t.get("threshold_id"),
            "currency": t.get("currency"),
            "min_amount": t.get("min_amount", t.get("min_value", 0)),
            "max_amount": t.get("max_amount", t.get("max_value")),
            "min_supplier_quotes": t.get("min_supplier_quotes", t.get("quotes_required", 1)),
            "managed_by": t.get("managed_by", t.get("approvers", [])),
            "deviation_approval_required_from": t.get("deviation_approval_required_from", []),
        })
    raw["approval_thresholds"] = thresholds

    # Normalize escalation rules (ER-008 uses different field names)
    escalations = []
    for e in raw.get("escalation_rules", []):
        escalations.append({
            "rule_id": e.get("rule_id"),
            "trigger": e.get("trigger"),
            "action": e.get("action", "escalate"),
            "escalate_to": e.get("escalate_to", e.get("escalation_target", "")),
        })
    raw["escalation_rules"] = escalations

    return raw


# ---------------------------------------------------------------------------
# Requests (for demo endpoint)
# ---------------------------------------------------------------------------

def load_requests() -> list[dict]:
    return _read_json("requests.json")


# ---------------------------------------------------------------------------
# Singleton store
# ---------------------------------------------------------------------------

class DataStore:
    """In-memory singleton holding all reference data."""

    _instance: DataStore | None = None

    def __init__(self) -> None:
        self.categories = load_categories()
        self.category_index = build_category_index(self.categories)

        self.suppliers = load_suppliers()
        self.supplier_by_key = build_supplier_by_key(self.suppliers)
        self.supplier_by_name = build_supplier_by_name(self.suppliers)
        self.suppliers_by_category = build_suppliers_by_category(self.suppliers)

        self.pricing = load_pricing()
        self.pricing_index = build_pricing_index(self.pricing)

        raw_policies = load_policies()
        self.policies = normalize_policies(raw_policies)

        self.requests = load_requests()

    @classmethod
    def get(cls) -> DataStore:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_supplier_id(self, name: str) -> str | None:
        """Fuzzy-ish lookup: exact lower-case match first, then substring."""
        lower = name.lower().strip()
        if lower in self.supplier_by_name:
            return self.supplier_by_name[lower]
        for sname, sid in self.supplier_by_name.items():
            if lower in sname or sname in lower:
                return sid
        return None

    def get_supplier_name(self, supplier_id: str) -> str | None:
        for s in self.suppliers:
            if s["supplier_id"] == supplier_id:
                return s["supplier_name"]
        return None

