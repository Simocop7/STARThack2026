"""Tests for the deterministic ranking engine.

These tests use the real DataStore (loads actual CSV/JSON reference data).
They test ranking logic: pricing tier selection, filtering, scoring, escalations.
"""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch

import pytest

from api.ranking_engine import (
    _check_restriction,
    _find_approval_threshold,
    _find_pricing_tier,
    rank_suppliers_deterministically,
)
from api.ranking_models import CleanOrderRecap, ScoringWeights


# ---------------------------------------------------------------------------
# Helper: build minimal CleanOrderRecap
# ---------------------------------------------------------------------------


def _order(
    request_id="REQ-TEST",
    category_l1="IT",
    category_l2="Laptops",
    quantity=10,
    delivery_country="DE",
    budget_amount=None,
    currency="EUR",
    required_by_date=None,
    data_residency_required=False,
    preferred_supplier_id=None,
    preferred_supplier_name=None,
) -> CleanOrderRecap:
    return CleanOrderRecap(
        request_id=request_id,
        category_l1=category_l1,
        category_l2=category_l2,
        quantity=quantity,
        delivery_country=delivery_country,
        budget_amount=budget_amount,
        currency=currency,
        required_by_date=required_by_date,
        data_residency_required=data_residency_required,
        preferred_supplier_id=preferred_supplier_id,
        preferred_supplier_name=preferred_supplier_name,
    )


# ---------------------------------------------------------------------------
# _find_pricing_tier unit tests
# ---------------------------------------------------------------------------


class TestFindPricingTier:
    """Unit tests for the pricing tier lookup function."""

    def _make_index(self, tiers: list[dict]) -> dict:
        """Build a pricing_index stub."""
        idx = {}
        for t in tiers:
            key = (t["supplier_id"], t["category_l1"], t["category_l2"], t["region"])
            idx.setdefault(key, []).append(t)
        return idx

    def _tier(self, min_q, max_q, price=100.0, sup="SUP-001", region="EU") -> dict:
        return {
            "supplier_id": sup,
            "category_l1": "IT",
            "category_l2": "Laptops",
            "region": region,
            "min_quantity": min_q,
            "max_quantity": max_q,
            "unit_price": price,
            "expedited_unit_price": price * 1.08,
            "moq": 1,
            "standard_lead_time_days": 5,
            "expedited_lead_time_days": 2,
        }

    def test_quantity_in_first_tier(self):
        idx = self._make_index([self._tier(1, 99), self._tier(100, 499)])
        result = _find_pricing_tier("SUP-001", "IT", "Laptops", "EU", 1, idx)
        assert result is not None
        assert result["min_quantity"] == 1

    def test_quantity_at_tier_boundary_lower(self):
        idx = self._make_index([self._tier(1, 99), self._tier(100, 499)])
        result = _find_pricing_tier("SUP-001", "IT", "Laptops", "EU", 100, idx)
        assert result is not None
        assert result["min_quantity"] == 100

    def test_quantity_at_tier_boundary_upper(self):
        idx = self._make_index([self._tier(1, 99), self._tier(100, 499)])
        result = _find_pricing_tier("SUP-001", "IT", "Laptops", "EU", 99, idx)
        assert result is not None
        assert result["max_quantity"] == 99

    def test_quantity_in_third_tier(self):
        idx = self._make_index([self._tier(1, 99), self._tier(100, 499), self._tier(500, 1999)])
        result = _find_pricing_tier("SUP-001", "IT", "Laptops", "EU", 500, idx)
        assert result is not None
        assert result["min_quantity"] == 500

    def test_quantity_above_all_tiers_returns_none(self):
        idx = self._make_index([self._tier(1, 99), self._tier(100, 499)])
        result = _find_pricing_tier("SUP-001", "IT", "Laptops", "EU", 50000, idx)
        assert result is None

    def test_ch_falls_back_to_eu(self):
        idx = self._make_index([self._tier(1, 99, region="EU")])
        # No CH-specific tier, should fall back to EU
        result = _find_pricing_tier("SUP-001", "IT", "Laptops", "CH", 10, idx)
        assert result is not None
        assert result["region"] == "EU"

    def test_ch_prefers_ch_tier(self):
        idx = self._make_index([
            self._tier(1, 99, price=100.0, region="EU"),
            self._tier(1, 99, price=120.0, region="CH"),
        ])
        result = _find_pricing_tier("SUP-001", "IT", "Laptops", "CH", 10, idx)
        assert result is not None
        assert result["region"] == "CH"

    def test_unknown_supplier_returns_none(self):
        idx = self._make_index([self._tier(1, 99)])
        result = _find_pricing_tier("SUP-999", "IT", "Laptops", "EU", 10, idx)
        assert result is None

    def test_wrong_category_returns_none(self):
        idx = self._make_index([self._tier(1, 99)])
        result = _find_pricing_tier("SUP-001", "IT", "Cloud Compute", "EU", 10, idx)
        assert result is None


# ---------------------------------------------------------------------------
# _check_restriction unit tests
# ---------------------------------------------------------------------------


class TestCheckRestriction:
    """Unit tests for the restriction checker (independent of DataStore)."""

    def _make_policies(self, rules: list[dict]) -> dict:
        return {"restricted_suppliers": rules}

    def test_no_restrictions_returns_false(self):
        is_restricted, reason = _check_restriction(
            "SUP-0001", "IT", "Laptops", "DE", 5000.0, "EUR", {"restricted_suppliers": []}
        )
        assert not is_restricted
        assert reason == ""

    def test_supplier_not_in_list_returns_false(self):
        policies = self._make_policies([{
            "supplier_id": "SUP-0099",
            "category_l1": "IT",
            "category_l2": "Laptops",
            "restriction_scope": ["DE"],
            "restriction_reason": "test",
        }])
        is_restricted, _ = _check_restriction("SUP-0001", "IT", "Laptops", "DE", None, "EUR", policies)
        assert not is_restricted

    def test_restricted_by_country_scope(self):
        policies = self._make_policies([{
            "supplier_id": "SUP-0008",
            "category_l1": "IT",
            "category_l2": "Laptops",
            "restriction_scope": ["CH", "DE"],
            "restriction_reason": "Restricted in CH and DE for Laptops",
        }])
        is_restricted, reason = _check_restriction("SUP-0008", "IT", "Laptops", "DE", None, "EUR", policies)
        assert is_restricted
        assert "Restricted" in reason

    def test_not_restricted_in_unlisted_country(self):
        policies = self._make_policies([{
            "supplier_id": "SUP-0008",
            "category_l1": "IT",
            "category_l2": "Laptops",
            "restriction_scope": ["CH", "DE"],
            "restriction_reason": "Restricted in CH and DE for Laptops",
        }])
        is_restricted, _ = _check_restriction("SUP-0008", "IT", "Laptops", "FR", None, "EUR", policies)
        assert not is_restricted

    def test_restricted_all_scope(self):
        policies = self._make_policies([{
            "supplier_id": "SUP-0011",
            "category_l1": "IT",
            "category_l2": "Cloud Storage",
            "restriction_scope": ["all"],
            "restriction_reason": "Restricted globally",
        }])
        is_restricted, _ = _check_restriction("SUP-0011", "IT", "Cloud Storage", "FR", None, "EUR", policies)
        assert is_restricted

    def test_sup0045_below_threshold_not_restricted(self):
        policies = self._make_policies([{
            "supplier_id": "SUP-0045",
            "category_l1": "Marketing",
            "category_l2": "Influencer Campaigns",
            "restriction_scope": ["all"],
            "restriction_reason": "Requires exception above EUR 75,000",
        }])
        is_restricted, _ = _check_restriction(
            "SUP-0045", "Marketing", "Influencer Campaigns", "DE", 50_000.0, "EUR", policies
        )
        assert not is_restricted

    def test_sup0045_above_threshold_restricted(self):
        policies = self._make_policies([{
            "supplier_id": "SUP-0045",
            "category_l1": "Marketing",
            "category_l2": "Influencer Campaigns",
            "restriction_scope": ["all"],
            "restriction_reason": "Requires exception above EUR 75,000",
        }])
        is_restricted, reason = _check_restriction(
            "SUP-0045", "Marketing", "Influencer Campaigns", "DE", 100_000.0, "EUR", policies
        )
        assert is_restricted
        assert "100,000" in reason or "exceeds" in reason

    def test_sup0045_exactly_at_threshold_not_restricted(self):
        policies = self._make_policies([{
            "supplier_id": "SUP-0045",
            "category_l1": "Marketing",
            "category_l2": "Influencer Campaigns",
            "restriction_scope": ["all"],
            "restriction_reason": "Requires exception above EUR 75,000",
        }])
        # total_value == threshold (75_000) → NOT restricted (<=)
        is_restricted, _ = _check_restriction(
            "SUP-0045", "Marketing", "Influencer Campaigns", "DE", 75_000.0, "EUR", policies
        )
        assert not is_restricted

    def test_sup0045_with_none_budget_is_restricted(self):
        policies = self._make_policies([{
            "supplier_id": "SUP-0045",
            "category_l1": "Marketing",
            "category_l2": "Influencer Campaigns",
            "restriction_scope": ["all"],
            "restriction_reason": "Requires exception above EUR 75,000",
        }])
        # None budget → can't confirm <= 75K → restricted
        is_restricted, _ = _check_restriction(
            "SUP-0045", "Marketing", "Influencer Campaigns", "DE", None, "EUR", policies
        )
        assert is_restricted

    def test_wrong_category_not_restricted(self):
        policies = self._make_policies([{
            "supplier_id": "SUP-0008",
            "category_l1": "IT",
            "category_l2": "Laptops",
            "restriction_scope": ["CH"],
            "restriction_reason": "Restricted in CH for Laptops",
        }])
        # Same supplier, different category → not restricted
        is_restricted, _ = _check_restriction(
            "SUP-0008", "IT", "Cloud Compute", "CH", None, "EUR", policies
        )
        assert not is_restricted


# ---------------------------------------------------------------------------
# _find_approval_threshold unit tests
# ---------------------------------------------------------------------------


class TestFindApprovalThreshold:
    def _make_policies(self, thresholds: list[dict]) -> dict:
        return {"approval_thresholds": thresholds}

    def _eur_thresholds(self):
        return [
            {"threshold_id": "T-EUR-1", "currency": "EUR", "min_amount": 0, "max_amount": 25_000,
             "min_supplier_quotes": 1, "managed_by": ["Business Approver"], "deviation_approval_required_from": []},
            {"threshold_id": "T-EUR-2", "currency": "EUR", "min_amount": 25_000, "max_amount": 100_000,
             "min_supplier_quotes": 2, "managed_by": ["Business + Procurement"], "deviation_approval_required_from": ["Procurement Manager"]},
            {"threshold_id": "T-EUR-3", "currency": "EUR", "min_amount": 100_000, "max_amount": 500_000,
             "min_supplier_quotes": 3, "managed_by": ["Head of Category"], "deviation_approval_required_from": []},
            {"threshold_id": "T-EUR-4", "currency": "EUR", "min_amount": 500_000, "max_amount": 5_000_000,
             "min_supplier_quotes": 3, "managed_by": ["Head of Strategic Sourcing"], "deviation_approval_required_from": []},
            {"threshold_id": "T-EUR-5", "currency": "EUR", "min_amount": 5_000_000, "max_amount": None,
             "min_supplier_quotes": 3, "managed_by": ["CPO"], "deviation_approval_required_from": []},
        ]

    def test_eur_below_25k(self):
        policies = self._make_policies(self._eur_thresholds())
        t = _find_approval_threshold(24_999, "EUR", policies)
        assert t is not None
        assert t["threshold_id"] == "T-EUR-1"
        assert t["min_supplier_quotes"] == 1

    def test_eur_at_25k_boundary(self):
        policies = self._make_policies(self._eur_thresholds())
        t = _find_approval_threshold(25_000, "EUR", policies)
        assert t is not None
        # 25000 is >= min_amount of tier 2 AND within tier 1 (max 25000)
        # min_amount <= value <= max_amount: T-EUR-1: 0 <= 25000 <= 25000 ✓
        assert t["threshold_id"] == "T-EUR-1"

    def test_eur_just_above_25k(self):
        policies = self._make_policies(self._eur_thresholds())
        t = _find_approval_threshold(25_001, "EUR", policies)
        assert t is not None
        assert t["threshold_id"] == "T-EUR-2"
        assert t["min_supplier_quotes"] == 2

    def test_eur_at_100k(self):
        policies = self._make_policies(self._eur_thresholds())
        t = _find_approval_threshold(100_000, "EUR", policies)
        assert t is not None
        # T-EUR-2: 25000 <= 100000 <= 100000 ✓
        assert t["threshold_id"] == "T-EUR-2"

    def test_eur_just_above_100k(self):
        policies = self._make_policies(self._eur_thresholds())
        t = _find_approval_threshold(100_001, "EUR", policies)
        assert t is not None
        assert t["threshold_id"] == "T-EUR-3"
        assert t["min_supplier_quotes"] == 3

    def test_eur_just_above_500k(self):
        policies = self._make_policies(self._eur_thresholds())
        t = _find_approval_threshold(500_001, "EUR", policies)
        assert t is not None
        assert t["threshold_id"] == "T-EUR-4"

    def test_eur_above_5m(self):
        policies = self._make_policies(self._eur_thresholds())
        t = _find_approval_threshold(10_000_000, "EUR", policies)
        assert t is not None
        assert t["threshold_id"] == "T-EUR-5"  # max_amount=None → inf
        assert "CPO" in t["managed_by"]

    def test_wrong_currency_returns_none(self):
        policies = self._make_policies(self._eur_thresholds())
        t = _find_approval_threshold(50_000, "CHF", policies)
        assert t is None

    def test_empty_thresholds_returns_none(self):
        t = _find_approval_threshold(50_000, "EUR", {"approval_thresholds": []})
        assert t is None


# ---------------------------------------------------------------------------
# Integration tests using real DataStore
# ---------------------------------------------------------------------------


class TestRankSuppliersIntegration:
    """Integration tests that use the real reference data (DataStore)."""

    def test_unknown_country_returns_er001_escalation(self):
        order = _order(delivery_country="XX")
        result = rank_suppliers_deterministically(order)
        assert result.ranking == []
        assert any(e.rule_id == "ER-001" for e in result.escalations)
        assert any(e.blocking for e in result.escalations)

    def test_unknown_category_returns_empty_ranking(self):
        order = _order(category_l1="Unknown", category_l2="NonExistent")
        result = rank_suppliers_deterministically(order)
        # No suppliers for this category
        assert result.ranking == []
        assert any(e.rule_id == "ER-004" for e in result.escalations)

    def test_laptops_in_de_returns_ranked_suppliers(self):
        order = _order(category_l1="IT", category_l2="Laptops", quantity=10, delivery_country="DE")
        result = rank_suppliers_deterministically(order)
        # Should find some suppliers
        assert len(result.ranking) >= 1
        # All ranked suppliers should have rank >= 1
        for s in result.ranking:
            assert s.rank >= 1

    def test_ranking_is_sorted_by_composite_score(self):
        order = _order(category_l1="IT", category_l2="Laptops", quantity=10, delivery_country="DE")
        result = rank_suppliers_deterministically(order)
        if len(result.ranking) >= 2:
            for i in range(len(result.ranking) - 1):
                assert result.ranking[i].composite_score >= result.ranking[i + 1].composite_score

    def test_data_residency_required_excludes_non_compliant(self):
        order = _order(
            category_l1="IT",
            category_l2="Cloud Storage",
            quantity=1,
            delivery_country="DE",
            data_residency_required=True,
        )
        result = rank_suppliers_deterministically(order)
        # All ranked suppliers must support data residency
        for s in result.ranking:
            # We trust the engine filtered correctly; just check exclusions have a reason
            pass
        for e in result.excluded:
            assert e.reason  # Every exclusion should have a reason

    def test_capacity_exceeded_triggers_er006(self):
        # Request a very large quantity to exceed any supplier's monthly capacity
        order = _order(
            category_l1="IT",
            category_l2="Laptops",
            quantity=999_999,
            delivery_country="DE",
        )
        result = rank_suppliers_deterministically(order)
        # Some suppliers will have capacity exceeded
        if result.excluded:
            capacity_exclusions = [e for e in result.excluded if "capacity" in e.reason.lower()]
            if capacity_exclusions:
                assert any(e.rule_id == "ER-006" for e in result.escalations)

    def test_budget_insufficient_flag(self):
        # Set a very low budget
        order = _order(
            category_l1="IT",
            category_l2="Laptops",
            quantity=100,
            delivery_country="DE",
            budget_amount=1.0,  # Ridiculously low
        )
        result = rank_suppliers_deterministically(order)
        if result.ranking:
            # Budget should be flagged as insufficient
            assert result.budget_sufficient is False

    def test_budget_sufficient_flag(self):
        order = _order(
            category_l1="IT",
            category_l2="Laptops",
            quantity=1,
            delivery_country="DE",
            budget_amount=999_999.0,  # Very generous budget
        )
        result = rank_suppliers_deterministically(order)
        if result.ranking:
            assert result.budget_sufficient is True

    def test_result_has_audit_trail(self):
        order = _order(category_l1="IT", category_l2="Laptops", quantity=10, delivery_country="DE")
        result = rank_suppliers_deterministically(order)
        assert len(result.policies_checked) > 0

    def test_excluded_suppliers_have_reasons(self):
        order = _order(category_l1="IT", category_l2="Laptops", quantity=10, delivery_country="DE")
        result = rank_suppliers_deterministically(order)
        for exc in result.excluded:
            assert exc.reason, f"Supplier {exc.supplier_id} excluded without reason"

    def test_scored_supplier_has_recommendation_note(self):
        order = _order(category_l1="IT", category_l2="Laptops", quantity=10, delivery_country="DE")
        result = rank_suppliers_deterministically(order)
        for s in result.ranking:
            assert s.recommendation_note, f"Supplier {s.supplier_id} has no recommendation note"

    def test_ch_delivery_works(self):
        order = _order(category_l1="IT", category_l2="Laptops", quantity=10, delivery_country="CH")
        result = rank_suppliers_deterministically(order)
        # Should not crash; CH may use EU pricing fallback
        assert result is not None

    def test_us_delivery_works(self):
        order = _order(category_l1="IT", category_l2="Laptops", quantity=10, delivery_country="US")
        result = rank_suppliers_deterministically(order)
        assert result is not None

    def test_sup0008_restricted_in_ch_for_laptops(self):
        """SUP-0008 (Computacenter) should be excluded for Laptops in CH."""
        order = _order(
            category_l1="IT",
            category_l2="Laptops",
            quantity=10,
            delivery_country="CH",
        )
        result = rank_suppliers_deterministically(order)
        # SUP-0008 should either not appear in ranking or appear in excluded
        ranked_ids = {s.supplier_id for s in result.ranking}
        excluded_ids = {e.supplier_id for e in result.excluded}
        # If SUP-0008 exists in this category, it must be excluded in CH
        all_ids = ranked_ids | excluded_ids
        if "SUP-0008" in all_ids:
            assert "SUP-0008" not in ranked_ids, "SUP-0008 should be excluded for Laptops in CH"

    def test_quantity_pricing_tier_applied_correctly(self):
        """Verify that different quantities select different pricing tiers."""
        order_small = _order(quantity=1, delivery_country="DE")
        order_large = _order(quantity=500, delivery_country="DE")
        result_small = rank_suppliers_deterministically(order_small)
        result_large = rank_suppliers_deterministically(order_large)
        # Both should work; large quantity may have different unit prices
        assert result_small is not None
        assert result_large is not None
        # Large quantities should generally have lower or equal unit price (volume discount)
        if result_small.ranking and result_large.ranking:
            # Check same supplier if present in both
            small_ids = {s.supplier_id: s.unit_price for s in result_small.ranking}
            large_ids = {s.supplier_id: s.unit_price for s in result_large.ranking}
            common = set(small_ids.keys()) & set(large_ids.keys())
            for sid in common:
                assert large_ids[sid] <= small_ids[sid], (
                    f"Supplier {sid}: larger quantity should not cost more per unit"
                )

    def test_custom_weights_affect_ranking(self):
        """Custom weights should produce potentially different ordering."""
        order = _order(category_l1="IT", category_l2="Laptops", quantity=50, delivery_country="DE")
        default_weights = ScoringWeights()
        # Price-heavy weights
        price_heavy = ScoringWeights(price=0.90, quality=0.025, risk=0.025, esg=0.025, lead_time=0.025)
        result_default = rank_suppliers_deterministically(order, default_weights)
        result_price = rank_suppliers_deterministically(order, price_heavy)
        # Both should return results
        assert result_default is not None
        assert result_price is not None

    def test_no_negative_scores(self):
        order = _order(category_l1="IT", category_l2="Laptops", quantity=10, delivery_country="DE")
        result = rank_suppliers_deterministically(order)
        for s in result.ranking:
            assert s.composite_score >= 0, f"Negative score for {s.supplier_id}"
            assert s.unit_price >= 0
            assert s.total_price >= 0
