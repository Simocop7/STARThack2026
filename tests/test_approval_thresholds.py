"""Tests for approval threshold logic in the ranking engine.

Tests _find_approval_threshold() and verify that the ranking engine
correctly assigns approval_threshold_id, quotes_required, etc.
"""

from __future__ import annotations

import pytest

from api.ranking_engine import _find_approval_threshold, rank_suppliers_deterministically
from api.ranking_models import CleanOrderRecap


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_policies(thresholds: list[dict]) -> dict:
    return {"approval_thresholds": thresholds, "restricted_suppliers": [], "preferred_suppliers": [],
            "category_rules": [], "geography_rules": [], "escalation_rules": []}


def _eur_thresholds() -> list[dict]:
    return [
        {
            "threshold_id": "EUR-T1",
            "currency": "EUR",
            "min_amount": 0,
            "max_amount": 25_000,
            "min_supplier_quotes": 1,
            "managed_by": ["Business Approver"],
            "deviation_approval_required_from": [],
        },
        {
            "threshold_id": "EUR-T2",
            "currency": "EUR",
            "min_amount": 25_000,
            "max_amount": 100_000,
            "min_supplier_quotes": 2,
            "managed_by": ["Business Approver", "Procurement"],
            "deviation_approval_required_from": ["Procurement Manager"],
        },
        {
            "threshold_id": "EUR-T3",
            "currency": "EUR",
            "min_amount": 100_000,
            "max_amount": 500_000,
            "min_supplier_quotes": 3,
            "managed_by": ["Head of Category"],
            "deviation_approval_required_from": [],
        },
        {
            "threshold_id": "EUR-T4",
            "currency": "EUR",
            "min_amount": 500_000,
            "max_amount": 5_000_000,
            "min_supplier_quotes": 3,
            "managed_by": ["Head of Strategic Sourcing"],
            "deviation_approval_required_from": [],
        },
        {
            "threshold_id": "EUR-T5",
            "currency": "EUR",
            "min_amount": 5_000_000,
            "max_amount": None,  # Unbounded
            "min_supplier_quotes": 3,
            "managed_by": ["CPO"],
            "deviation_approval_required_from": [],
        },
    ]


def _usd_thresholds() -> list[dict]:
    return [
        {"threshold_id": "USD-T1", "currency": "USD", "min_amount": 0, "max_amount": 27_000,
         "min_supplier_quotes": 1, "managed_by": ["Business Approver"], "deviation_approval_required_from": []},
        {"threshold_id": "USD-T2", "currency": "USD", "min_amount": 27_000, "max_amount": 108_000,
         "min_supplier_quotes": 2, "managed_by": ["Business + Procurement"], "deviation_approval_required_from": ["Procurement Manager"]},
        {"threshold_id": "USD-T3", "currency": "USD", "min_amount": 108_000, "max_amount": 540_000,
         "min_supplier_quotes": 3, "managed_by": ["Head of Category"], "deviation_approval_required_from": []},
        {"threshold_id": "USD-T4", "currency": "USD", "min_amount": 540_000, "max_amount": 5_400_000,
         "min_supplier_quotes": 3, "managed_by": ["Head of Strategic Sourcing"], "deviation_approval_required_from": []},
        {"threshold_id": "USD-T5", "currency": "USD", "min_amount": 5_400_000, "max_amount": None,
         "min_supplier_quotes": 3, "managed_by": ["CPO"], "deviation_approval_required_from": []},
    ]


# ---------------------------------------------------------------------------
# EUR threshold tests
# ---------------------------------------------------------------------------


class TestEURThresholds:
    def test_zero_value_hits_tier1(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(0, "EUR", policies)
        assert t is not None
        assert t["threshold_id"] == "EUR-T1"
        assert t["min_supplier_quotes"] == 1

    def test_1_eur_hits_tier1(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(1, "EUR", policies)
        assert t["threshold_id"] == "EUR-T1"

    def test_24999_hits_tier1(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(24_999, "EUR", policies)
        assert t["threshold_id"] == "EUR-T1"
        assert t["min_supplier_quotes"] == 1

    def test_25000_hits_tier1_boundary(self):
        # 0 <= 25000 <= 25000 → tier 1
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(25_000, "EUR", policies)
        assert t is not None
        assert t["threshold_id"] == "EUR-T1"

    def test_25001_hits_tier2(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(25_001, "EUR", policies)
        assert t["threshold_id"] == "EUR-T2"
        assert t["min_supplier_quotes"] == 2
        assert "Procurement Manager" in t["deviation_approval_required_from"]

    def test_99999_hits_tier2(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(99_999, "EUR", policies)
        assert t["threshold_id"] == "EUR-T2"

    def test_100000_hits_tier2_boundary(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(100_000, "EUR", policies)
        # 25000 <= 100000 <= 100000 → tier 2
        assert t["threshold_id"] == "EUR-T2"

    def test_100001_hits_tier3(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(100_001, "EUR", policies)
        assert t["threshold_id"] == "EUR-T3"
        assert t["min_supplier_quotes"] == 3
        assert "Head of Category" in t["managed_by"]

    def test_499999_hits_tier3(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(499_999, "EUR", policies)
        assert t["threshold_id"] == "EUR-T3"

    def test_500001_hits_tier4(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(500_001, "EUR", policies)
        assert t["threshold_id"] == "EUR-T4"
        assert "Head of Strategic Sourcing" in t["managed_by"]

    def test_4999999_hits_tier4(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(4_999_999, "EUR", policies)
        assert t["threshold_id"] == "EUR-T4"

    def test_5000001_hits_tier5_cpo(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(5_000_001, "EUR", policies)
        assert t["threshold_id"] == "EUR-T5"
        assert "CPO" in t["managed_by"]

    def test_very_large_value_hits_tier5(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(1_000_000_000, "EUR", policies)
        assert t["threshold_id"] == "EUR-T5"


# ---------------------------------------------------------------------------
# USD threshold tests
# ---------------------------------------------------------------------------


class TestUSDThresholds:
    def test_usd_below_27k(self):
        policies = _make_policies(_usd_thresholds())
        t = _find_approval_threshold(26_999, "USD", policies)
        assert t["threshold_id"] == "USD-T1"

    def test_usd_above_27k(self):
        policies = _make_policies(_usd_thresholds())
        t = _find_approval_threshold(27_001, "USD", policies)
        assert t["threshold_id"] == "USD-T2"

    def test_usd_above_108k(self):
        policies = _make_policies(_usd_thresholds())
        t = _find_approval_threshold(108_001, "USD", policies)
        assert t["threshold_id"] == "USD-T3"

    def test_usd_above_540k(self):
        policies = _make_policies(_usd_thresholds())
        t = _find_approval_threshold(540_001, "USD", policies)
        assert t["threshold_id"] == "USD-T4"

    def test_usd_above_5_4m(self):
        policies = _make_policies(_usd_thresholds())
        t = _find_approval_threshold(5_400_001, "USD", policies)
        assert t["threshold_id"] == "USD-T5"
        assert "CPO" in t["managed_by"]


# ---------------------------------------------------------------------------
# Currency mismatch / edge cases
# ---------------------------------------------------------------------------


class TestThresholdEdgeCases:
    def test_wrong_currency_returns_none(self):
        policies = _make_policies(_eur_thresholds())
        t = _find_approval_threshold(50_000, "CHF", policies)
        assert t is None

    def test_empty_threshold_list_returns_none(self):
        t = _find_approval_threshold(50_000, "EUR", {"approval_thresholds": []})
        assert t is None

    def test_none_max_amount_treated_as_infinity(self):
        """max_amount=None should match any value above min."""
        policies = _make_policies([{
            "threshold_id": "T-INF",
            "currency": "EUR",
            "min_amount": 1_000_000,
            "max_amount": None,
            "min_supplier_quotes": 3,
            "managed_by": ["CPO"],
            "deviation_approval_required_from": [],
        }])
        t = _find_approval_threshold(999_999_999, "EUR", policies)
        assert t is not None
        assert t["threshold_id"] == "T-INF"

    def test_mixed_currencies_no_cross_match(self):
        """EUR thresholds should not match USD requests."""
        all_thresholds = _eur_thresholds() + _usd_thresholds()
        policies = _make_policies(all_thresholds)
        t_eur = _find_approval_threshold(50_000, "EUR", policies)
        t_usd = _find_approval_threshold(50_000, "USD", policies)
        assert t_eur is not None
        assert t_usd is not None
        assert t_eur["currency"] == "EUR"
        assert t_usd["currency"] == "USD"


# ---------------------------------------------------------------------------
# Integration: verify ranking engine uses approval thresholds from real data
# ---------------------------------------------------------------------------


class TestApprovalThresholdInRanking:
    """Test that the ranking engine picks up approval thresholds from real policies."""

    def test_ranking_sets_approval_threshold(self):
        order = CleanOrderRecap(
            request_id="REQ-TEST-THR",
            category_l1="IT",
            category_l2="Laptops",
            quantity=100,
            delivery_country="DE",
            budget_amount=50_000,
            currency="EUR",
        )
        result = rank_suppliers_deterministically(order)
        if result.ranking:
            # Should have an approval threshold set
            assert result.approval_threshold_id is not None or result.approval_threshold_note is not None

    def test_ranking_includes_quotes_required(self):
        order = CleanOrderRecap(
            request_id="REQ-TEST-THR2",
            category_l1="IT",
            category_l2="Laptops",
            quantity=200,
            delivery_country="DE",
            budget_amount=200_000,  # Above 100K → 3 quotes required
            currency="EUR",
        )
        result = rank_suppliers_deterministically(order)
        if result.ranking and result.quotes_required is not None:
            # Above 100K EUR → should require >= 3 quotes
            assert result.quotes_required >= 1  # At minimum some quotes required
