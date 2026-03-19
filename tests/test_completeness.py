"""Tests for the completeness validator."""

from datetime import date

import pytest
from pydantic import ValidationError

from api.models import EnrichedRequest, Severity, IssueType
from api.validators.completeness import check_completeness


def _make_enriched(**overrides) -> EnrichedRequest:
    defaults = {
        "request_text": "Need 50 laptops",
        "quantity": 50,
        "unit_of_measure": "device",
        "category_l1": "IT",
        "category_l2": "Laptops",
        "delivery_country": "CH",
        "delivery_address": "Zurich, Switzerland",
        "required_by_date": date(2026, 6, 1),
        "item_description": "Business laptops",
    }
    defaults.update(overrides)
    return EnrichedRequest(**defaults)


def test_all_fields_present_no_issues():
    enriched = _make_enriched()
    issues = check_completeness(enriched)
    assert issues == []


def test_missing_quantity():
    enriched = _make_enriched(quantity=None)
    issues = check_completeness(enriched)
    assert len(issues) == 1
    assert issues[0].severity == Severity.CRITICAL
    assert issues[0].type == IssueType.MISSING_INFO
    assert "quantity" in issues[0].fix_action.field.lower()


def test_zero_quantity_rejected_by_model():
    with pytest.raises(ValidationError, match="greater than or equal to 1"):
        _make_enriched(quantity=0)


def test_negative_quantity_rejected_by_model():
    with pytest.raises(ValidationError, match="greater than or equal to 1"):
        _make_enriched(quantity=-5)


def test_missing_category_l1():
    enriched = _make_enriched(category_l1=None)
    issues = check_completeness(enriched)
    assert any(i.fix_action.field == "category_l1" for i in issues)


def test_missing_category_l2():
    enriched = _make_enriched(category_l2=None)
    issues = check_completeness(enriched)
    assert any(i.fix_action.field == "category_l2" for i in issues)


def test_missing_delivery_address():
    enriched = _make_enriched(delivery_address=None)
    issues = check_completeness(enriched)
    assert any(i.fix_action.field == "delivery_address" for i in issues)


def test_missing_delivery_country():
    enriched = _make_enriched(delivery_country=None)
    issues = check_completeness(enriched)
    assert any(i.fix_action.field == "delivery_country" for i in issues)


def test_missing_required_by_date():
    enriched = _make_enriched(required_by_date=None)
    issues = check_completeness(enriched)
    assert any(i.fix_action.field == "required_by_date" for i in issues)


def test_multiple_missing_fields():
    enriched = _make_enriched(
        quantity=None, category_l1=None, delivery_address=None,
    )
    issues = check_completeness(enriched)
    fields = {i.fix_action.field for i in issues}
    assert "quantity" in fields
    assert "category_l1" in fields
    assert "delivery_address" in fields


def test_issue_ids_are_unique():
    enriched = _make_enriched(
        quantity=None, category_l1=None, category_l2=None,
    )
    issues = check_completeness(enriched)
    ids = [i.issue_id for i in issues]
    assert len(ids) == len(set(ids))
