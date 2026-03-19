"""Tests for the policy rules validator."""

from datetime import date

from api.models import EnrichedRequest, IssueType, Severity
from api.validators.policy_rules import check_policy_rules


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


def test_no_matching_rules():
    policies = {"category_rules": [], "geography_rules": []}
    enriched = _make_enriched()
    issues = check_policy_rules(enriched, policies)
    assert issues == []


def test_category_rule_cr002_triggers():
    policies = {
        "category_rules": [
            {
                "rule_id": "CR-002",
                "category_l1": "IT",
                "category_l2": "Mobile Workstations",
                "rule_type": "engineering_review",
                "rule_text": "Mobile Workstations > 50 units require engineering review.",
            }
        ],
        "geography_rules": [],
    }
    enriched = _make_enriched(
        category_l2="Mobile Workstations", quantity=100,
    )
    issues = check_policy_rules(enriched, policies)
    assert len(issues) == 1
    assert issues[0].severity == Severity.INFO
    assert "CR-002" in issues[0].description


def test_category_rule_cr002_below_threshold():
    policies = {
        "category_rules": [
            {
                "rule_id": "CR-002",
                "category_l1": "IT",
                "category_l2": "Mobile Workstations",
                "rule_type": "engineering_review",
                "rule_text": "Mobile Workstations > 50 units require engineering review.",
            }
        ],
        "geography_rules": [],
    }
    enriched = _make_enriched(
        category_l2="Mobile Workstations", quantity=30,
    )
    issues = check_policy_rules(enriched, policies)
    assert issues == []


def test_geography_rule_country_match():
    policies = {
        "category_rules": [],
        "geography_rules": [
            {
                "rule_id": "GR-001",
                "country": "CH",
                "rule_text": "Swiss data residency required.",
            }
        ],
    }
    enriched = _make_enriched(delivery_country="CH")
    issues = check_policy_rules(enriched, policies)
    assert len(issues) == 1
    assert "GR-001" in issues[0].description


def test_geography_rule_country_no_match():
    policies = {
        "category_rules": [],
        "geography_rules": [
            {
                "rule_id": "GR-001",
                "country": "CH",
                "rule_text": "Swiss data residency required.",
            }
        ],
    }
    enriched = _make_enriched(delivery_country="DE")
    issues = check_policy_rules(enriched, policies)
    assert issues == []


def test_geography_rule_countries_list():
    policies = {
        "category_rules": [],
        "geography_rules": [
            {
                "rule_id": "GR-005",
                "countries": ["US", "CA"],
                "applies_to": ["IT"],
                "rule_text": "US data sovereignty for financial/healthcare.",
            }
        ],
    }
    enriched = _make_enriched(delivery_country="US")
    issues = check_policy_rules(enriched, policies)
    assert len(issues) == 1


def test_category_rule_cr004_data_residency():
    policies = {
        "category_rules": [
            {
                "rule_id": "CR-004",
                "category_l1": "IT",
                "category_l2": "Cloud Compute",
                "rule_type": "data_residency",
                "rule_text": "Only residency-compliant suppliers.",
            }
        ],
        "geography_rules": [],
    }
    enriched = _make_enriched(
        category_l2="Cloud Compute",
        data_residency_required=True,
    )
    issues = check_policy_rules(enriched, policies)
    assert len(issues) == 1
    assert "CR-004" in issues[0].description


def test_always_applied_rules():
    policies = {
        "category_rules": [
            {
                "rule_id": "CR-006",
                "category_l1": "Facilities",
                "category_l2": "Reception/Lounge",
                "rule_type": "design_signoff",
                "rule_text": "Design sign-off required.",
            }
        ],
        "geography_rules": [],
    }
    enriched = _make_enriched(
        category_l1="Facilities", category_l2="Reception/Lounge",
    )
    issues = check_policy_rules(enriched, policies)
    assert len(issues) == 1
