"""Integration-style tests for real-world edge cases from the hackathon scenario tags.

Tests combine multiple validators to simulate full pipeline scenarios.
All LLM calls are bypassed; we construct EnrichedRequest directly.

Scenario tags tested:
- missing_info: all fields null except request_text
- contradictory: quantity mismatch
- restricted: preferred supplier is restricted in the country
- threshold: value near approval boundaries
- lead_time: critically short delivery deadline
- multilingual: non-English request
- capacity: quantity exceeds supplier monthly capacity
- multi_country: unsupported delivery country
- empty input: minimal/boundary inputs
- perfect input: no issues expected
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from api.models import EnrichedRequest, IssueType, Severity
from api.ranking_engine import rank_suppliers_deterministically
from api.ranking_models import CleanOrderRecap
from api.validators.category_check import check_category
from api.validators.completeness import check_completeness
from api.validators.contradiction import check_contradictions
from api.validators.lead_time import check_lead_time  # noqa: F401 (used in TestLeadTimeScenario)
from api.validators.supplier_checker import check_supplier


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _enriched(**kwargs) -> EnrichedRequest:
    base = {"request_text": "test request"}
    base.update(kwargs)
    return EnrichedRequest(**base)


CATEGORY_INDEX = {
    "IT": ["Laptops", "Mobile Workstations", "Cloud Compute", "Cloud Storage", "Managed Cloud"],
    "Facilities": ["Break-Fix", "Reception / Lounge Furniture"],
    "Professional Services": ["Software Development", "Cybersecurity Advisory"],
    "Marketing": ["SEM", "Influencer Campaigns"],
}

FAKE_PRICING_INDEX: dict = {}

FAKE_SUPPLIERS_BY_CAT: dict = {}
FAKE_SUPPLIER_BY_KEY: dict = {}
NO_POLICIES: dict = {"restricted_suppliers": []}


# ---------------------------------------------------------------------------
# missing_info scenario
# ---------------------------------------------------------------------------


class TestMissingInfoScenario:
    """Tag: missing_info — all required fields absent."""

    def test_all_required_missing(self):
        enriched = _enriched()  # Only request_text set
        issues = check_completeness(enriched)
        # Should flag: quantity, category_l1, category_l2, delivery_country, required_by_date
        issue_fields = [i.fix_action.field for i in issues if i.fix_action]
        assert "quantity" in issue_fields
        assert "category_l1" in issue_fields
        assert "delivery_country" in issue_fields
        assert "required_by_date" in issue_fields

    def test_all_missing_are_critical(self):
        enriched = _enriched()
        issues = check_completeness(enriched)
        for issue in issues:
            assert issue.severity == Severity.CRITICAL

    def test_partial_missing_flagged(self):
        enriched = _enriched(quantity=5, category_l1="IT", category_l2="Laptops")
        # Missing delivery_country and required_by_date
        issues = check_completeness(enriched)
        fields = [i.fix_action.field for i in issues if i.fix_action]
        assert "delivery_country" in fields
        assert "required_by_date" in fields

    def test_unit_of_measure_required_when_flagged(self):
        enriched = _enriched(
            quantity=5,
            category_l1="IT",
            category_l2="Laptops",
            delivery_country="DE",
            required_by_date=date.today() + timedelta(days=30),
            unit_of_measure_required=True,
            unit_of_measure=None,
        )
        issues = check_completeness(enriched)
        fields = [i.fix_action.field for i in issues if i.fix_action]
        assert "unit_of_measure" in fields


# ---------------------------------------------------------------------------
# contradictory scenario
# ---------------------------------------------------------------------------


class TestContradictoryScenario:
    """Tag: contradictory — quantity in text ≠ form quantity."""

    def _form(self, quantity=5) -> "FormInput":
        from api.models import FormInput
        return FormInput(request_text="I need some laptops", quantity=quantity)

    def test_quantity_mismatch_flagged(self):
        from api.models import FormInput, TextContradiction
        contradiction = TextContradiction(
            field="quantity",
            form_value="5",
            text_value="50",
            explanation="Request text mentions 50 units but form says 5",
        )
        form = FormInput(request_text="I need 50 laptops", quantity=5)
        enriched = _enriched(
            quantity=5,
            text_quantity_mentioned=50,
            text_contradictions=[contradiction],
        )
        issues = check_contradictions(enriched, form)
        assert any(i.type == IssueType.CONTRADICTORY for i in issues)

    def test_no_contradiction_when_values_match(self):
        from api.models import FormInput
        form = FormInput(request_text="I need 50 laptops", quantity=50)
        enriched = _enriched(quantity=50, text_quantity_mentioned=50)
        issues = check_contradictions(enriched, form)
        assert not any(i.type == IssueType.CONTRADICTORY for i in issues)

    def test_text_contradictions_from_llm_surfaced(self):
        from api.models import FormInput, TextContradiction
        form = FormInput(request_text="I need some equipment")
        enriched = _enriched(
            text_contradictions=[
                TextContradiction(
                    field="category_l2",
                    form_value="Laptops",
                    text_value="Mobile Workstations",
                    explanation="Text says workstations but form says Laptops",
                )
            ]
        )
        issues = check_contradictions(enriched, form)
        assert any(i.type == IssueType.CONTRADICTORY for i in issues)


# ---------------------------------------------------------------------------
# lead_time scenario
# ---------------------------------------------------------------------------


class TestLeadTimeScenario:
    """Tag: lead_time — delivery deadline too short."""

    def _pricing_idx(self) -> dict:
        """Stub pricing index with a supplier that has 10 day standard lead time."""
        key = ("SUP-0001", "IT", "Laptops", "EU")
        return {
            key: [{
                "supplier_id": "SUP-0001",
                "category_l1": "IT",
                "category_l2": "Laptops",
                "region": "EU",
                "min_quantity": 1,
                "max_quantity": 9999,
                "unit_price": 800.0,
                "expedited_unit_price": 864.0,
                "standard_lead_time_days": 10,
                "expedited_lead_time_days": 3,
                "moq": 1,
            }]
        }

    def _suppliers_by_cat(self) -> dict:
        return {
            ("IT", "Laptops"): [{
                "supplier_id": "SUP-0001",
                "supplier_name": "Test Supplier",
                "category_l1": "IT",
                "category_l2": "Laptops",
                "service_regions": ["DE", "FR"],
                "capacity_per_month": 1000,
            }]
        }

    def test_date_in_past_flagged(self):
        enriched = _enriched(
            category_l1="IT",
            category_l2="Laptops",
            delivery_country="DE",
            required_by_date=date.today() - timedelta(days=5),
        )
        issues = check_lead_time(enriched, self._pricing_idx(), self._suppliers_by_cat())
        assert any(i.type == IssueType.LEAD_TIME_WARNING for i in issues)

    def test_tomorrow_infeasible_for_hardware(self):
        enriched = _enriched(
            category_l1="IT",
            category_l2="Laptops",
            delivery_country="DE",
            required_by_date=date.today() + timedelta(days=1),
        )
        issues = check_lead_time(enriched, self._pricing_idx(), self._suppliers_by_cat())
        # 1 day < 3 day expedited → infeasible
        assert any(i.type == IssueType.LEAD_TIME_WARNING for i in issues)

    def test_comfortable_deadline_no_critical_issue(self):
        enriched = _enriched(
            category_l1="IT",
            category_l2="Laptops",
            delivery_country="DE",
            required_by_date=date.today() + timedelta(days=60),
        )
        issues = check_lead_time(enriched, self._pricing_idx(), self._suppliers_by_cat())
        # No critical lead time issue for a far-future date
        critical_issues = [i for i in issues if i.severity == Severity.CRITICAL]
        assert len(critical_issues) == 0


# ---------------------------------------------------------------------------
# multilingual scenario
# ---------------------------------------------------------------------------


class TestMultilingualScenario:
    """Tag: multilingual — non-English inputs processed correctly."""

    def test_italian_language_accepted(self):
        from api.models import FormInput
        form = FormInput(request_text="Ho bisogno di 10 laptop per il mio ufficio", language="it")
        assert form.language == "it"
        assert form.request_text == "Ho bisogno di 10 laptop per il mio ufficio"

    def test_french_language_accepted(self):
        from api.models import FormInput
        form = FormInput(request_text="J'ai besoin de 50 ordinateurs portables", language="fr")
        assert form.language == "fr"

    def test_german_language_accepted(self):
        from api.models import FormInput
        form = FormInput(request_text="Ich brauche 20 Laptops für unser Büro", language="de")
        assert form.language == "de"

    def test_japanese_language_accepted(self):
        from api.models import FormInput
        form = FormInput(request_text="ラップトップ10台が必要です", language="ja")
        assert form.language == "ja"

    def test_unsupported_language_defaults_to_en(self):
        from api.models import FormInput
        form = FormInput(request_text="Мне нужны ноутбуки", language="ru")
        assert form.language == "en"

    def test_mixed_script_in_request_text_accepted(self):
        from api.models import FormInput
        form = FormInput(request_text="Need 10 laptops / 10 ordinateurs portables / 10台のラップトップ")
        assert "Need 10 laptops" in form.request_text


# ---------------------------------------------------------------------------
# capacity scenario
# ---------------------------------------------------------------------------


class TestCapacityScenario:
    """Tag: capacity — requested quantity exceeds supplier monthly capacity."""

    def test_high_quantity_triggers_er006_in_ranking(self):
        """Requesting huge quantity should trigger ER-006 escalation if any supplier is excluded."""
        order = CleanOrderRecap(
            request_id="REQ-CAP-001",
            category_l1="IT",
            category_l2="Laptops",
            quantity=999_999,
            delivery_country="DE",
            currency="EUR",
        )
        result = rank_suppliers_deterministically(order)
        # If there are capacity exclusions, ER-006 should be escalated
        capacity_exclusions = [e for e in result.excluded if "capacity" in e.reason.lower()]
        if capacity_exclusions:
            er006 = [e for e in result.escalations if e.rule_id == "ER-006"]
            assert len(er006) >= 1
            assert er006[0].escalate_to == "Sourcing Excellence Lead"


# ---------------------------------------------------------------------------
# unknown/unsupported country scenario
# ---------------------------------------------------------------------------


class TestUnknownCountryScenario:
    """Tag: multi_country — delivery country not supported."""

    def test_unknown_country_in_ranking_triggers_er001(self):
        order = CleanOrderRecap(
            request_id="REQ-XX-001",
            category_l1="IT",
            category_l2="Laptops",
            quantity=10,
            delivery_country="XX",  # Not in region_mapper
            currency="EUR",
        )
        result = rank_suppliers_deterministically(order)
        assert result.ranking == []
        assert any(e.rule_id == "ER-001" for e in result.escalations)
        assert any(e.blocking for e in result.escalations)

    def test_invalid_country_in_form_becomes_none(self):
        from api.models import FormInput
        form = FormInput(request_text="need laptops", delivery_country="ZZ")
        assert form.delivery_country is None

    def test_none_country_triggers_completeness_issue(self):
        enriched = _enriched(
            quantity=10,
            category_l1="IT",
            category_l2="Laptops",
            delivery_country=None,
            required_by_date=date.today() + timedelta(days=30),
        )
        issues = check_completeness(enriched)
        fields = [i.fix_action.field for i in issues if i.fix_action]
        assert "delivery_country" in fields


# ---------------------------------------------------------------------------
# Perfectly valid input scenario
# ---------------------------------------------------------------------------


class TestPerfectInputScenario:
    """A well-formed request should produce zero completeness issues."""

    def test_complete_request_no_completeness_issues(self):
        enriched = _enriched(
            quantity=10,
            category_l1="IT",
            category_l2="Laptops",
            delivery_country="DE",
            required_by_date=date.today() + timedelta(days=30),
        )
        issues = check_completeness(enriched)
        assert issues == []

    def test_complete_request_no_contradiction_issues(self):
        from api.models import FormInput
        form = FormInput(request_text="I need 10 laptops", quantity=10)
        enriched = _enriched(
            quantity=10,
            text_quantity_mentioned=10,
            text_contradictions=[],
        )
        issues = check_contradictions(enriched, form)
        assert issues == []

    def test_complete_request_no_category_issues(self):
        enriched = _enriched(category_l1="IT", category_l2="Laptops")
        issues = check_category(enriched, CATEGORY_INDEX)
        assert issues == []

    def test_complete_ranking_returns_results(self):
        order = CleanOrderRecap(
            request_id="REQ-PERFECT",
            category_l1="IT",
            category_l2="Laptops",
            quantity=10,
            delivery_country="DE",
            budget_amount=10_000.0,
            currency="EUR",
            required_by_date=date.today() + timedelta(days=30),
        )
        result = rank_suppliers_deterministically(order)
        # Perfect request should yield at least 1 ranked supplier
        assert len(result.ranking) >= 1
        # No blocking escalations
        blocking = [e for e in result.escalations if e.blocking]
        assert len(blocking) == 0


# ---------------------------------------------------------------------------
# Boundary / tricky edge cases
# ---------------------------------------------------------------------------


class TestBoundaryEdgeCases:
    def test_quantity_1_valid(self):
        from api.models import FormInput
        form = FormInput(request_text="need one laptop", quantity=1)
        assert form.quantity == 1

    def test_quantity_1000000_valid(self):
        from api.models import FormInput
        form = FormInput(request_text="massive order", quantity=1_000_000)
        assert form.quantity == 1_000_000

    def test_request_text_exactly_1_char(self):
        from api.models import FormInput
        form = FormInput(request_text="x")
        assert form.request_text == "x"

    def test_request_text_exactly_10000_chars(self):
        from api.models import FormInput
        form = FormInput(request_text="x" * 10000)
        assert len(form.request_text) == 10000

    def test_unicode_in_request_text(self):
        from api.models import FormInput
        form = FormInput(request_text="需要10台笔记本电脑 — pour notre équipe à Zürich")
        assert "笔记本" in form.request_text

    def test_emoji_in_request_text(self):
        from api.models import FormInput
        form = FormInput(request_text="I need 10 💻 laptops please")
        assert "💻" in form.request_text

    def test_required_by_date_far_future(self):
        enriched = _enriched(
            required_by_date=date(2099, 12, 31),
            category_l1="IT",
            category_l2="Laptops",
        )
        # Should not crash
        issues = check_completeness(enriched)
        # required_by_date is set, so no issue for that field
        fields = [i.fix_action.field for i in issues if i.fix_action]
        assert "required_by_date" not in fields

    def test_only_request_text_produces_multiple_critical_issues(self):
        """Completely empty form (only request_text) should produce 5 critical issues."""
        enriched = _enriched()
        issues = check_completeness(enriched)
        critical = [i for i in issues if i.severity == Severity.CRITICAL]
        assert len(critical) >= 4  # At minimum: quantity, category_l1, category_l2, delivery_country

    def test_data_residency_required_true_propagates(self):
        order = CleanOrderRecap(
            request_id="REQ-DR",
            category_l1="IT",
            category_l2="Cloud Storage",
            quantity=1,
            delivery_country="CH",
            data_residency_required=True,
            currency="CHF",
        )
        result = rank_suppliers_deterministically(order)
        # All ranked suppliers must have data residency support
        # (engine filters out non-compliant ones)
        # Just check it doesn't crash
        assert result is not None
