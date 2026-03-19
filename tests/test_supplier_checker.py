"""Tests for the supplier checker validator."""

from datetime import date

from api.models import EnrichedRequest, IssueType, Severity
from api.validators.supplier_checker import check_supplier


def _make_enriched(**overrides) -> EnrichedRequest:
    defaults = {
        "request_text": "Need laptops",
        "quantity": 50,
        "category_l1": "IT",
        "category_l2": "Laptops",
        "delivery_country": "CH",
        "delivery_address": "Zurich",
        "required_by_date": date(2026, 6, 1),
        "item_description": "Laptops",
        "preferred_supplier_id": "SUP-0001",
        "preferred_supplier_name": "Dell Technologies",
    }
    defaults.update(overrides)
    return EnrichedRequest(**defaults)


_SUPPLIER_ROW = {
    "supplier_id": "SUP-0001",
    "supplier_name": "Dell Technologies",
    "category_l1": "IT",
    "category_l2": "Laptops",
    "service_regions": ["CH", "DE", "FR"],
    "quality_score": 85,
    "risk_score": 20,
    "esg_score": 75,
    "preferred_supplier": True,
    "is_restricted": False,
    "data_residency_supported": True,
    "capacity_per_month": 500,
}

_ALT_SUPPLIER = {
    **_SUPPLIER_ROW,
    "supplier_id": "SUP-0002",
    "supplier_name": "Lenovo",
}


def _suppliers_by_category():
    return {("IT", "Laptops"): [_SUPPLIER_ROW, _ALT_SUPPLIER]}


def _supplier_by_key():
    return {
        ("SUP-0001", "IT", "Laptops"): _SUPPLIER_ROW,
        ("SUP-0002", "IT", "Laptops"): _ALT_SUPPLIER,
    }


def _empty_policies():
    return {"restricted_suppliers": []}


def test_valid_supplier_no_issues():
    enriched = _make_enriched()
    issues = check_supplier(
        enriched,
        suppliers_by_category=_suppliers_by_category(),
        supplier_by_key=_supplier_by_key(),
        policies=_empty_policies(),
    )
    assert issues == []


def test_no_preferred_supplier_skips():
    enriched = _make_enriched(preferred_supplier_id=None)
    issues = check_supplier(
        enriched,
        suppliers_by_category=_suppliers_by_category(),
        supplier_by_key=_supplier_by_key(),
        policies=_empty_policies(),
    )
    assert issues == []


def test_category_mismatch():
    enriched = _make_enriched(
        preferred_supplier_id="SUP-9999",
        preferred_supplier_name="Unknown Corp",
    )
    issues = check_supplier(
        enriched,
        suppliers_by_category=_suppliers_by_category(),
        supplier_by_key=_supplier_by_key(),
        policies=_empty_policies(),
    )
    assert len(issues) == 1
    assert issues[0].type == IssueType.CATEGORY_MISMATCH
    assert issues[0].severity == Severity.HIGH


def test_geography_mismatch():
    enriched = _make_enriched(delivery_country="US")
    issues = check_supplier(
        enriched,
        suppliers_by_category=_suppliers_by_category(),
        supplier_by_key=_supplier_by_key(),
        policies=_empty_policies(),
    )
    assert any(i.type == IssueType.GEOGRAPHY_MISMATCH for i in issues)


def test_restricted_supplier():
    policies = {
        "restricted_suppliers": [
            {
                "supplier_id": "SUP-0001",
                "category_l2": "Laptops",
                "restriction_scope": ["CH"],
                "restriction_reason": "Data sovereignty",
            }
        ],
    }
    enriched = _make_enriched()
    issues = check_supplier(
        enriched,
        suppliers_by_category=_suppliers_by_category(),
        supplier_by_key=_supplier_by_key(),
        policies=policies,
    )
    assert any(i.type == IssueType.RESTRICTED_SUPPLIER for i in issues)


def test_restricted_supplier_global_scope():
    policies = {
        "restricted_suppliers": [
            {
                "supplier_id": "SUP-0001",
                "category_l2": "Laptops",
                "restriction_scope": ["all"],
                "restriction_reason": "Global ban",
            }
        ],
    }
    enriched = _make_enriched(delivery_country="US")
    issues = check_supplier(
        enriched,
        suppliers_by_category=_suppliers_by_category(),
        supplier_by_key=_supplier_by_key(),
        policies=policies,
    )
    assert any(i.type == IssueType.RESTRICTED_SUPPLIER for i in issues)


def test_restricted_supplier_different_country_no_issue():
    policies = {
        "restricted_suppliers": [
            {
                "supplier_id": "SUP-0001",
                "category_l2": "Laptops",
                "restriction_scope": ["DE"],
                "restriction_reason": "DE only restriction",
            }
        ],
    }
    enriched = _make_enriched(delivery_country="CH")
    issues = check_supplier(
        enriched,
        suppliers_by_category=_suppliers_by_category(),
        supplier_by_key=_supplier_by_key(),
        policies=policies,
    )
    assert not any(i.type == IssueType.RESTRICTED_SUPPLIER for i in issues)


def test_capacity_exceeded():
    enriched = _make_enriched(quantity=1000)
    issues = check_supplier(
        enriched,
        suppliers_by_category=_suppliers_by_category(),
        supplier_by_key=_supplier_by_key(),
        policies=_empty_policies(),
    )
    assert any(i.type == IssueType.CAPACITY_EXCEEDED for i in issues)


def test_capacity_within_limit():
    enriched = _make_enriched(quantity=100)
    issues = check_supplier(
        enriched,
        suppliers_by_category=_suppliers_by_category(),
        supplier_by_key=_supplier_by_key(),
        policies=_empty_policies(),
    )
    assert not any(i.type == IssueType.CAPACITY_EXCEEDED for i in issues)
