"""Tests for the category check validator."""

from __future__ import annotations

import pytest

from api.models import EnrichedRequest, IssueType, Severity
from api.validators.category_check import check_category

# ---------------------------------------------------------------------------
# Fixture: minimal taxonomy
# ---------------------------------------------------------------------------

CATEGORY_INDEX = {
    "IT": ["Laptops", "Mobile Workstations", "Cloud Compute", "Cloud Storage", "Managed Cloud"],
    "Facilities": ["Break-Fix", "Reception / Lounge Furniture"],
    "Professional Services": ["Software Development", "Cybersecurity Advisory"],
    "Marketing": ["SEM", "Influencer Campaigns"],
}


def _enriched(category_l1=None, category_l2=None) -> EnrichedRequest:
    return EnrichedRequest(
        request_text="test request",
        category_l1=category_l1,
        category_l2=category_l2,
    )


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


class TestCategoryCheckHappyPath:
    def test_both_none_returns_no_issues(self):
        enriched = _enriched(category_l1=None, category_l2=None)
        issues = check_category(enriched, CATEGORY_INDEX)
        assert issues == []

    def test_valid_l1_no_l2_returns_no_issues(self):
        enriched = _enriched(category_l1="IT", category_l2=None)
        issues = check_category(enriched, CATEGORY_INDEX)
        assert issues == []

    def test_valid_l1_and_l2_returns_no_issues(self):
        enriched = _enriched(category_l1="IT", category_l2="Laptops")
        issues = check_category(enriched, CATEGORY_INDEX)
        assert issues == []

    def test_all_valid_l1s_pass(self):
        for l1 in CATEGORY_INDEX:
            enriched = _enriched(category_l1=l1)
            issues = check_category(enriched, CATEGORY_INDEX)
            assert issues == [], f"Expected no issues for valid L1 '{l1}'"

    def test_all_valid_l2s_pass(self):
        for l1, l2s in CATEGORY_INDEX.items():
            for l2 in l2s:
                enriched = _enriched(category_l1=l1, category_l2=l2)
                issues = check_category(enriched, CATEGORY_INDEX)
                assert issues == [], f"Expected no issues for {l1}/{l2}"


# ---------------------------------------------------------------------------
# Unknown L1
# ---------------------------------------------------------------------------


class TestUnknownL1:
    def test_unknown_l1_produces_critical_issue(self):
        enriched = _enriched(category_l1="Finance", category_l2=None)
        issues = check_category(enriched, CATEGORY_INDEX)
        assert len(issues) == 1
        assert issues[0].issue_id == "CATV-001"
        assert issues[0].severity == Severity.CRITICAL
        assert issues[0].type == IssueType.CATEGORY_MISMATCH

    def test_unknown_l1_returns_early_does_not_check_l2(self):
        enriched = _enriched(category_l1="Finance", category_l2="Laptops")
        issues = check_category(enriched, CATEGORY_INDEX)
        assert len(issues) == 1
        assert issues[0].issue_id == "CATV-001"  # Only L1 error, no L2 error

    def test_typo_l1_suggests_close_match(self):
        # "Fachilities" is close to "Facilities"
        enriched = _enriched(category_l1="Fachilities", category_l2=None)
        issues = check_category(enriched, CATEGORY_INDEX)
        assert len(issues) == 1
        # Should suggest "Facilities"
        assert "Facilities" in issues[0].proposed_fix or (
            issues[0].fix_action is not None
            and issues[0].fix_action.suggested_value == "Facilities"
        )

    def test_completely_random_l1_still_returns_issue(self):
        enriched = _enriched(category_l1="ZZZZZZZZZ", category_l2=None)
        issues = check_category(enriched, CATEGORY_INDEX)
        assert len(issues) == 1
        assert issues[0].issue_id == "CATV-001"

    def test_unknown_l1_fix_action_has_field_category_l1(self):
        enriched = _enriched(category_l1="Unknown", category_l2=None)
        issues = check_category(enriched, CATEGORY_INDEX)
        assert issues[0].fix_action is not None
        assert issues[0].fix_action.field == "category_l1"

    def test_unknown_l1_alternatives_not_empty(self):
        enriched = _enriched(category_l1="Unknown", category_l2=None)
        issues = check_category(enriched, CATEGORY_INDEX)
        assert issues[0].fix_action is not None
        # alternatives should come from valid L1s
        assert len(issues[0].fix_action.alternatives) > 0


# ---------------------------------------------------------------------------
# Unknown L2
# ---------------------------------------------------------------------------


class TestUnknownL2:
    def test_unknown_l2_produces_critical_issue(self):
        enriched = _enriched(category_l1="IT", category_l2="Printers")
        issues = check_category(enriched, CATEGORY_INDEX)
        assert len(issues) == 1
        assert issues[0].issue_id == "CATV-002"
        assert issues[0].severity == Severity.CRITICAL

    def test_l2_from_wrong_l1_produces_issue(self):
        # "Laptops" is valid under IT, not Facilities
        enriched = _enriched(category_l1="Facilities", category_l2="Laptops")
        issues = check_category(enriched, CATEGORY_INDEX)
        assert len(issues) == 1
        assert issues[0].issue_id == "CATV-002"

    def test_unknown_l2_fix_action_has_field_category_l2(self):
        enriched = _enriched(category_l1="IT", category_l2="Printers")
        issues = check_category(enriched, CATEGORY_INDEX)
        assert issues[0].fix_action is not None
        assert issues[0].fix_action.field == "category_l2"

    def test_l2_typo_suggests_close_match(self):
        # "Laptop" is close to "Laptops"
        enriched = _enriched(category_l1="IT", category_l2="Laptop")
        issues = check_category(enriched, CATEGORY_INDEX)
        assert len(issues) == 1
        fix = issues[0].fix_action
        assert fix is not None
        assert fix.suggested_value == "Laptops"

    def test_l2_only_present_with_valid_l1_is_checked(self):
        enriched = _enriched(category_l1="Marketing", category_l2="Billboards")
        issues = check_category(enriched, CATEGORY_INDEX)
        assert len(issues) == 1
        assert issues[0].issue_id == "CATV-002"


# ---------------------------------------------------------------------------
# Empty taxonomy edge cases
# ---------------------------------------------------------------------------


class TestEmptyTaxonomy:
    def test_empty_taxonomy_unknown_l1_returns_issue_with_no_suggestion(self):
        enriched = _enriched(category_l1="IT", category_l2=None)
        issues = check_category(enriched, {})
        assert len(issues) == 1
        # No valid L1s → suggestion is None, generic message
        assert "Please select a valid category." in issues[0].proposed_fix

    def test_empty_l2_list_for_valid_l1(self):
        # L1 exists but has no L2 entries
        enriched = _enriched(category_l1="IT", category_l2="Laptops")
        issues = check_category(enriched, {"IT": []})
        assert len(issues) == 1
        assert issues[0].issue_id == "CATV-002"
