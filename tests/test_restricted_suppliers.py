"""Extended tests for supplier restriction and preference logic.

Covers conditional restrictions (SUP-0045 value-based), geographic scoping,
category mismatches, and preferred supplier identification.
"""

from __future__ import annotations

import pytest

from api.models import EnrichedRequest, IssueType, Severity
from api.validators.supplier_checker import check_supplier


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _enriched(
    preferred_supplier_id=None,
    preferred_supplier_name=None,
    preferred_supplier=None,
    category_l1="IT",
    category_l2="Laptops",
    delivery_country="DE",
    quantity=10,
) -> EnrichedRequest:
    return EnrichedRequest(
        request_text="test request",
        preferred_supplier_id=preferred_supplier_id,
        preferred_supplier_name=preferred_supplier_name,
        preferred_supplier=preferred_supplier,
        category_l1=category_l1,
        category_l2=category_l2,
        delivery_country=delivery_country,
        quantity=quantity,
    )


def _supplier_row(
    sup_id="SUP-0001",
    name="Test Supplier",
    cat_l1="IT",
    cat_l2="Laptops",
    service_regions=None,
    capacity=1000,
    is_restricted=False,
    data_residency=False,
) -> dict:
    return {
        "supplier_id": sup_id,
        "supplier_name": name,
        "category_l1": cat_l1,
        "category_l2": cat_l2,
        "service_regions": service_regions or ["DE", "FR", "NL"],
        "capacity_per_month": capacity,
        "is_restricted": is_restricted,
        "data_residency_supported": data_residency,
        "quality_score": 80,
        "risk_score": 20,
        "esg_score": 75,
        "preferred_supplier": False,
        "contract_status": "active",
    }


def _by_key(rows: list[dict]) -> dict:
    return {(r["supplier_id"], r["category_l1"], r["category_l2"]): r for r in rows}


def _by_category(rows: list[dict]) -> dict:
    idx: dict = {}
    for r in rows:
        key = (r["category_l1"], r["category_l2"])
        idx.setdefault(key, []).append(r)
    return idx


def _no_restrictions() -> dict:
    return {"restricted_suppliers": []}


def _policies_with_restriction(
    supplier_id: str,
    cat_l2: str,
    scope: list[str],
    reason: str,
    cat_l1: str = "IT",
) -> dict:
    return {
        "restricted_suppliers": [{
            "supplier_id": supplier_id,
            "category_l1": cat_l1,
            "category_l2": cat_l2,
            "restriction_scope": scope,
            "restriction_reason": reason,
        }]
    }


# ---------------------------------------------------------------------------
# No preferred supplier → skip
# ---------------------------------------------------------------------------


class TestNoPreferredSupplier:
    def test_no_supplier_id_returns_no_issues(self):
        enriched = _enriched(preferred_supplier_id=None)
        rows = [_supplier_row()]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        assert issues == []

    def test_missing_category_skips_check(self):
        enriched = _enriched(preferred_supplier_id="SUP-0001", category_l1=None, category_l2=None)
        rows = [_supplier_row()]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        assert issues == []


# ---------------------------------------------------------------------------
# Category mismatch
# ---------------------------------------------------------------------------


class TestCategoryMismatch:
    def test_supplier_in_different_category_flagged(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            preferred_supplier_name="Test Supplier",
            category_l1="Facilities",
            category_l2="Break-Fix",
        )
        # Supplier only exists under IT/Laptops
        rows = [_supplier_row(cat_l1="IT", cat_l2="Laptops")]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        assert len(issues) == 1
        assert issues[0].type == IssueType.CATEGORY_MISMATCH
        assert issues[0].severity == Severity.HIGH

    def test_category_mismatch_returns_early(self):
        """Category mismatch should not also check geography or restrictions."""
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            category_l1="Facilities",
            category_l2="Break-Fix",
            delivery_country="DE",
        )
        rows = [_supplier_row(cat_l1="IT", cat_l2="Laptops")]
        policies = _policies_with_restriction("SUP-0001", "Break-Fix", ["DE"], "Restricted in DE")
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), policies)
        # Only CATEGORY_MISMATCH, not RESTRICTED_SUPPLIER
        assert len(issues) == 1
        assert issues[0].type == IssueType.CATEGORY_MISMATCH

    def test_category_mismatch_suggests_alternatives(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            category_l1="IT",
            category_l2="Cloud Compute",
        )
        rows = [
            _supplier_row(sup_id="SUP-0001", cat_l1="IT", cat_l2="Laptops"),
            _supplier_row(sup_id="SUP-0002", name="Cloud Inc", cat_l1="IT", cat_l2="Cloud Compute"),
        ]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        assert len(issues) == 1
        # Should suggest Cloud Inc as an alternative
        assert issues[0].fix_action is not None
        assert "Cloud Inc" in (issues[0].fix_action.suggested_value or "")


# ---------------------------------------------------------------------------
# Geography mismatch
# ---------------------------------------------------------------------------


class TestGeographyMismatch:
    def test_supplier_not_in_country_flagged(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            delivery_country="JP",  # Not in service_regions
        )
        rows = [_supplier_row(service_regions=["DE", "FR", "NL"])]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        assert any(i.type == IssueType.GEOGRAPHY_MISMATCH for i in issues)

    def test_supplier_in_country_no_geography_issue(self):
        enriched = _enriched(preferred_supplier_id="SUP-0001", delivery_country="DE")
        rows = [_supplier_row(service_regions=["DE", "FR"])]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        assert not any(i.type == IssueType.GEOGRAPHY_MISMATCH for i in issues)

    def test_geography_issue_suggests_alternative(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            delivery_country="JP",
        )
        rows = [
            _supplier_row(sup_id="SUP-0001", service_regions=["DE", "FR"]),
            _supplier_row(sup_id="SUP-0002", name="Japan Supplier", service_regions=["JP", "SG"]),
        ]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        geo_issues = [i for i in issues if i.type == IssueType.GEOGRAPHY_MISMATCH]
        assert len(geo_issues) == 1
        assert "Japan Supplier" in (geo_issues[0].fix_action.suggested_value or "")


# ---------------------------------------------------------------------------
# Restriction checks
# ---------------------------------------------------------------------------


class TestRestrictionCheck:
    def test_country_scoped_restriction_in_scope(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0008",
            preferred_supplier_name="Computacenter",
            category_l1="IT",
            category_l2="Laptops",
            delivery_country="CH",
        )
        rows = [_supplier_row(sup_id="SUP-0008", name="Computacenter")]
        policies = _policies_with_restriction("SUP-0008", "Laptops", ["CH", "DE"], "Restricted in CH+DE for Laptops")
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), policies)
        assert any(i.type == IssueType.RESTRICTED_SUPPLIER for i in issues)

    def test_country_scoped_restriction_outside_scope(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0008",
            category_l2="Laptops",
            delivery_country="FR",  # Not in restriction scope
        )
        rows = [_supplier_row(sup_id="SUP-0008")]
        policies = _policies_with_restriction("SUP-0008", "Laptops", ["CH", "DE"], "Restricted")
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), policies)
        assert not any(i.type == IssueType.RESTRICTED_SUPPLIER for i in issues)

    def test_global_restriction_all_scope(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0011",
            category_l1="IT",
            category_l2="Cloud Storage",
            delivery_country="FR",
        )
        rows = [_supplier_row(sup_id="SUP-0011", cat_l2="Cloud Storage")]
        policies = _policies_with_restriction("SUP-0011", "Cloud Storage", ["all"], "Data sovereignty", cat_l1="IT")
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), policies)
        assert any(i.type == IssueType.RESTRICTED_SUPPLIER for i in issues)

    def test_restriction_different_category_not_applied(self):
        """Restriction for Laptops should NOT apply to Cloud Compute."""
        enriched = _enriched(
            preferred_supplier_id="SUP-0008",
            category_l1="IT",
            category_l2="Cloud Compute",
            delivery_country="CH",
        )
        rows = [_supplier_row(sup_id="SUP-0008", cat_l2="Cloud Compute")]
        policies = _policies_with_restriction("SUP-0008", "Laptops", ["CH"], "Restricted for Laptops")
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), policies)
        assert not any(i.type == IssueType.RESTRICTED_SUPPLIER for i in issues)

    def test_sup0017_restricted_in_us_for_cloud_storage(self):
        """SUP-0017 (Alibaba Cloud) restricted in US for Cloud Storage."""
        enriched = _enriched(
            preferred_supplier_id="SUP-0017",
            preferred_supplier_name="Alibaba Cloud",
            category_l1="IT",
            category_l2="Cloud Storage",
            delivery_country="US",
        )
        rows = [_supplier_row(sup_id="SUP-0017", cat_l2="Cloud Storage", service_regions=["US", "SG", "AU"])]
        policies = _policies_with_restriction(
            "SUP-0017", "Cloud Storage", ["US", "CA", "AU", "IN"], "Data sovereignty", cat_l1="IT"
        )
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), policies)
        assert any(i.type == IssueType.RESTRICTED_SUPPLIER for i in issues)

    def test_sup0017_not_restricted_in_de(self):
        """SUP-0017 NOT restricted in DE for Cloud Storage."""
        enriched = _enriched(
            preferred_supplier_id="SUP-0017",
            category_l1="IT",
            category_l2="Cloud Storage",
            delivery_country="DE",
        )
        rows = [_supplier_row(sup_id="SUP-0017", cat_l2="Cloud Storage", service_regions=["DE", "US"])]
        policies = _policies_with_restriction(
            "SUP-0017", "Cloud Storage", ["US", "CA", "AU", "IN"], "Data sovereignty", cat_l1="IT"
        )
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), policies)
        assert not any(i.type == IssueType.RESTRICTED_SUPPLIER for i in issues)

    def test_restriction_high_severity(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0011",
            category_l1="IT",
            category_l2="Cloud Storage",
            delivery_country="CH",
        )
        rows = [_supplier_row(sup_id="SUP-0011", cat_l2="Cloud Storage", service_regions=["CH", "DE"])]
        policies = _policies_with_restriction("SUP-0011", "Cloud Storage", ["CH"], "Data sovereignty CH", cat_l1="IT")
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), policies)
        for i in issues:
            if i.type == IssueType.RESTRICTED_SUPPLIER:
                assert i.severity == Severity.HIGH


# ---------------------------------------------------------------------------
# Capacity checks
# ---------------------------------------------------------------------------


class TestCapacityChecks:
    def test_quantity_above_capacity_flagged(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            quantity=5000,
        )
        rows = [_supplier_row(capacity=1000)]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        assert any(i.type == IssueType.CAPACITY_EXCEEDED for i in issues)

    def test_quantity_exactly_at_capacity_ok(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            quantity=1000,
        )
        rows = [_supplier_row(capacity=1000)]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        assert not any(i.type == IssueType.CAPACITY_EXCEEDED for i in issues)

    def test_capacity_issue_suggests_split(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            quantity=2000,
        )
        rows = [_supplier_row(capacity=500)]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        cap_issues = [i for i in issues if i.type == IssueType.CAPACITY_EXCEEDED]
        assert len(cap_issues) == 1
        # Should mention splitting or reducing quantity
        assert "500" in cap_issues[0].proposed_fix

    def test_capacity_issue_medium_severity(self):
        enriched = _enriched(preferred_supplier_id="SUP-0001", quantity=9999)
        rows = [_supplier_row(capacity=100)]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        for i in issues:
            if i.type == IssueType.CAPACITY_EXCEEDED:
                assert i.severity == Severity.MEDIUM


# ---------------------------------------------------------------------------
# Multiple issues
# ---------------------------------------------------------------------------


class TestMultipleIssues:
    def test_geography_and_capacity_both_reported(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            delivery_country="JP",  # Geography mismatch
            quantity=9999,  # Capacity exceeded
        )
        rows = [_supplier_row(service_regions=["DE", "FR"], capacity=100)]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        types = {i.type for i in issues}
        assert IssueType.GEOGRAPHY_MISMATCH in types
        assert IssueType.CAPACITY_EXCEEDED in types

    def test_issue_ids_are_unique(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            delivery_country="JP",
            quantity=9999,
        )
        rows = [_supplier_row(service_regions=["DE"], capacity=100)]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        ids = [i.issue_id for i in issues]
        assert len(ids) == len(set(ids))

    def test_valid_supplier_no_issues(self):
        enriched = _enriched(
            preferred_supplier_id="SUP-0001",
            delivery_country="DE",
            quantity=10,
        )
        rows = [_supplier_row(service_regions=["DE", "FR"], capacity=1000)]
        issues = check_supplier(enriched, _by_category(rows), _by_key(rows), _no_restrictions())
        assert issues == []
