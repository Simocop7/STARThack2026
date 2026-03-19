"""Tests for the contradiction validator."""

from datetime import date

from api.models import (
    EnrichedRequest,
    FormInput,
    IssueType,
    Severity,
    TextContradiction,
)
from api.validators.contradiction import check_contradictions


def _make_form(**overrides) -> FormInput:
    defaults = {
        "request_text": "Need 50 laptops for Zurich office",
        "quantity": 50,
        "category_l1": "IT",
        "category_l2": "Laptops",
        "delivery_address": "Zurich, Switzerland",
        "required_by_date": date(2026, 6, 1),
    }
    defaults.update(overrides)
    return FormInput(**defaults)


def _make_enriched(**overrides) -> EnrichedRequest:
    defaults = {
        "request_text": "Need 50 laptops for Zurich office",
        "quantity": 50,
        "category_l1": "IT",
        "category_l2": "Laptops",
        "delivery_country": "CH",
        "delivery_address": "Zurich, Switzerland",
        "required_by_date": date(2026, 6, 1),
        "item_description": "Business laptops",
        "text_quantity_mentioned": None,
        "text_contradictions": [],
    }
    defaults.update(overrides)
    return EnrichedRequest(**defaults)


def test_no_contradictions():
    form = _make_form()
    enriched = _make_enriched()
    issues = check_contradictions(enriched, form)
    assert issues == []


def test_quantity_mismatch_text_vs_form():
    form = _make_form(quantity=50)
    enriched = _make_enriched(text_quantity_mentioned=100)
    issues = check_contradictions(enriched, form)
    assert len(issues) == 1
    assert issues[0].type == IssueType.CONTRADICTORY
    assert issues[0].severity == Severity.HIGH
    assert "100" in issues[0].description
    assert "50" in issues[0].description


def test_quantity_match_no_issue():
    form = _make_form(quantity=50)
    enriched = _make_enriched(text_quantity_mentioned=50)
    issues = check_contradictions(enriched, form)
    assert issues == []


def test_text_quantity_none_no_issue():
    form = _make_form(quantity=50)
    enriched = _make_enriched(text_quantity_mentioned=None)
    issues = check_contradictions(enriched, form)
    assert issues == []


def test_form_quantity_none_no_issue():
    form = _make_form(quantity=None)
    enriched = _make_enriched(text_quantity_mentioned=100)
    issues = check_contradictions(enriched, form)
    assert issues == []


def test_llm_detected_contradiction():
    form = _make_form()
    enriched = _make_enriched(
        text_contradictions=[
            TextContradiction(
                field="category_l2",
                form_value="Laptops",
                text_value="Mobile Workstations",
                explanation="Text says mobile workstations but form says laptops.",
            )
        ],
    )
    issues = check_contradictions(enriched, form)
    assert len(issues) == 1
    assert issues[0].type == IssueType.CONTRADICTORY
    assert issues[0].severity == Severity.MEDIUM
    assert issues[0].fix_action.field == "category_l2"


def test_both_quantity_and_llm_contradictions():
    form = _make_form(quantity=50)
    enriched = _make_enriched(
        text_quantity_mentioned=200,
        text_contradictions=[
            TextContradiction(
                field="delivery_address",
                form_value="Zurich",
                text_value="Berlin",
                explanation="Address mismatch.",
            )
        ],
    )
    issues = check_contradictions(enriched, form)
    assert len(issues) == 2
    ids = [i.issue_id for i in issues]
    assert len(ids) == len(set(ids))
