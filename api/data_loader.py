"""Load and index all reference data at startup."""

from __future__ import annotations

import csv
import json
import logging
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "ChainIQ-START-Hack-2026-" / "data"

logger = logging.getLogger(__name__)


def _read_csv(filename: str) -> list[dict[str, str]]:
    try:
        with open(DATA_DIR / filename, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
        logger.error("Data file not found: %s — returning empty list.", DATA_DIR / filename)
        return []
    except (OSError, UnicodeDecodeError) as exc:
        logger.error("Failed to read CSV %s: %s — returning empty list.", filename, exc)
        return []


def _read_json(filename: str) -> Any:
    try:
        with open(DATA_DIR / filename, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.error("Data file not found: %s — returning empty dict.", DATA_DIR / filename)
        return {}
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        logger.error("Failed to read JSON %s: %s — returning empty dict.", filename, exc)
        return {}


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
    return [
        {
            **row,
            "service_regions": [r.strip() for r in row["service_regions"].split(";") if r.strip()],
            "quality_score": int(row["quality_score"]),
            "risk_score": int(row["risk_score"]),
            "esg_score": int(row["esg_score"]),
            "preferred_supplier": row["preferred_supplier"] == "True",
            "is_restricted": row["is_restricted"] == "True",
            "data_residency_supported": row["data_residency_supported"] == "True",
            "capacity_per_month": int(row["capacity_per_month"]),
        }
        for row in _read_csv("suppliers.csv")
    ]


def build_supplier_by_key(suppliers: list[dict]) -> dict[tuple[str, str, str], dict]:
    """Index by (supplier_id, category_l1, category_l2)."""
    return {(s["supplier_id"], s["category_l1"], s["category_l2"]): s for s in suppliers}


def build_supplier_by_name(suppliers: list[dict]) -> dict[str, str]:
    """Map supplier_name (lowered) -> supplier_id. Deduped (same name always same id)."""
    return {s["supplier_name"].lower(): s["supplier_id"] for s in suppliers}


def build_suppliers_by_category(
    suppliers: list[dict],
) -> dict[tuple[str, str], list[dict]]:
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
    return [
        {
            **row,
            "min_quantity": int(row["min_quantity"]),
            "max_quantity": int(row["max_quantity"]),
            "unit_price": float(row["unit_price"]),
            "moq": int(row["moq"]),
            "standard_lead_time_days": int(row["standard_lead_time_days"]),
            "expedited_lead_time_days": int(row["expedited_lead_time_days"]),
            "expedited_unit_price": float(row["expedited_unit_price"]),
        }
        for row in _read_csv("pricing.csv")
    ]


def build_pricing_index(
    pricing: list[dict],
) -> dict[tuple[str, str, str, str], list[dict]]:
    """Index by (supplier_id, category_l1, category_l2, region) -> sorted tier list."""
    index: dict[tuple[str, str, str, str], list[dict]] = {}
    for row in pricing:
        key = (
            row["supplier_id"],
            row["category_l1"],
            row["category_l2"],
            row["region"],
        )
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
    """Normalize schema inconsistencies in policies.json. Returns a new dict."""
    thresholds = [
        {
            "threshold_id": t.get("threshold_id"),
            "currency": t.get("currency"),
            "min_amount": t.get("min_amount", t.get("min_value", 0)),
            "max_amount": t.get("max_amount", t.get("max_value")),
            "min_supplier_quotes": t.get("min_supplier_quotes", t.get("quotes_required", 1)),
            "managed_by": t.get("managed_by", t.get("approvers", [])),
            "deviation_approval_required_from": t.get("deviation_approval_required_from", []),
        }
        for t in raw.get("approval_thresholds", [])
    ]

    escalations = [
        {
            "rule_id": e.get("rule_id"),
            "trigger": e.get("trigger"),
            "action": e.get("action", "escalate"),
            "escalate_to": e.get("escalate_to", e.get("escalation_target", "")),
        }
        for e in raw.get("escalation_rules", [])
    ]

    return {
        **raw,
        "approval_thresholds": thresholds,
        "escalation_rules": escalations,
    }


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
        self.supplier_id_to_name: dict[str, str] = {s["supplier_id"]: s["supplier_name"] for s in self.suppliers}
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
        """Fuzzy-ish lookup: exact lower-case match first, then substring.

        Safety guards:
        - Requires at least 3 chars for substring matching
        - Returns None if multiple suppliers match (ambiguous)
        """
        lower = name.lower().strip()
        if not lower:
            return None
        if lower in self.supplier_by_name:
            return self.supplier_by_name[lower]
        # Only attempt substring matching for queries >= 3 chars
        if len(lower) < 3:
            return None
        matches: list[str] = []
        for sname, sid in self.supplier_by_name.items():
            if lower in sname or sname in lower:
                matches.append(sid)
        # Ambiguous match → return None instead of guessing
        if len(matches) == 1:
            return matches[0]
        return None

    def get_supplier_name(self, supplier_id: str) -> str | None:
        return self.supplier_id_to_name.get(supplier_id)
