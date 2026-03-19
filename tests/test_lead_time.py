"""Tests for the lead time validator."""

from datetime import date, timedelta

from api.models import EnrichedRequest, IssueType, Severity
from api.validators.lead_time import check_lead_time


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
    }
    defaults.update(overrides)
    return EnrichedRequest(**defaults)


_SUPPLIER = {
    "supplier_id": "SUP-0001",
    "supplier_name": "Dell Technologies",
    "category_l1": "IT",
    "category_l2": "Laptops",
    "service_regions": ["CH", "DE"],
    "capacity_per_month": 500,
}

_PRICING_TIER = {
    "supplier_id": "SUP-0001",
    "category_l1": "IT",
    "category_l2": "Laptops",
    "region": "CH",
    "min_quantity": 1,
    "max_quantity": 99,
    "unit_price": 1200.0,
    "moq": 1,
    "standard_lead_time_days": 14,
    "expedited_lead_time_days": 7,
    "expedited_unit_price": 1296.0,
}


def _pricing_index():
    return {("SUP-0001", "IT", "Laptops", "CH"): [_PRICING_TIER]}


def _suppliers_by_category():
    return {("IT", "Laptops"): [_SUPPLIER]}


_TODAY = date(2026, 3, 19)


def test_date_in_past():
    enriched = _make_enriched(required_by_date=date(2026, 3, 1))
    issues = check_lead_time(
        enriched, _pricing_index(), _suppliers_by_category(), today=_TODAY,
    )
    assert len(issues) == 1
    assert issues[0].severity == Severity.CRITICAL
    assert issues[0].issue_id == "LT-001"


def test_feasible_standard_delivery():
    enriched = _make_enriched(required_by_date=_TODAY + timedelta(days=30))
    issues = check_lead_time(
        enriched, _pricing_index(), _suppliers_by_category(), today=_TODAY,
    )
    assert issues == []


def test_needs_expedited_shipping():
    enriched = _make_enriched(required_by_date=_TODAY + timedelta(days=10))
    issues = check_lead_time(
        enriched, _pricing_index(), _suppliers_by_category(), today=_TODAY,
    )
    assert len(issues) == 1
    assert issues[0].severity == Severity.MEDIUM
    assert issues[0].issue_id == "LT-003"


def test_infeasible_even_expedited():
    enriched = _make_enriched(required_by_date=_TODAY + timedelta(days=3))
    issues = check_lead_time(
        enriched, _pricing_index(), _suppliers_by_category(), today=_TODAY,
    )
    assert len(issues) == 1
    assert issues[0].severity == Severity.HIGH
    assert issues[0].issue_id == "LT-002"


def test_missing_required_date_skips():
    enriched = _make_enriched(required_by_date=None)
    issues = check_lead_time(
        enriched, _pricing_index(), _suppliers_by_category(), today=_TODAY,
    )
    assert issues == []


def test_missing_category_skips():
    enriched = _make_enriched(category_l1=None)
    issues = check_lead_time(
        enriched, _pricing_index(), _suppliers_by_category(), today=_TODAY,
    )
    assert issues == []


def test_no_suppliers_for_category_skips():
    enriched = _make_enriched()
    issues = check_lead_time(
        enriched, _pricing_index(), {}, today=_TODAY,
    )
    assert issues == []


def test_supplier_not_covering_country_skipped():
    enriched = _make_enriched(
        delivery_country="US",
        required_by_date=_TODAY + timedelta(days=3),
    )
    issues = check_lead_time(
        enriched, _pricing_index(), _suppliers_by_category(), today=_TODAY,
    )
    assert issues == []
