"""Deterministic Supplier Ranking Engine.

Implements a multi-stage pipeline:
  1. FILTER  — hard-constraint elimination (category, geography, restrictions, capacity)
  2. PRICE   — tier lookup and cost computation
  3. SCORE   — weighted composite across price, quality, risk, ESG, lead-time
  4. RANK    — sort, assign ranks, generate audit rationales

Every decision is recorded so the output is fully auditable.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from api.data_loader import DataStore
from api.ranking_models import (
    CleanOrderRecap,
    ComplianceCheck,
    Escalation,
    ExcludedSupplier,
    RankedSupplierOutput,
    RankingMethod,
    RawScores,
    ScoreBreakdown,
    ScoredSupplier,
    ScoringWeights,
)
from api.region_mapper import country_to_region


def _fmt_tier(min_qty: int, max_qty: int) -> str:
    """Format a pricing tier range for human-readable display.

    Examples: (1, 99) → '1–99 units', (200000, 999999999) → '200,000+ units'
    """
    lo = f"{min_qty:,}"
    if max_qty >= 999_999_999:
        return f"{lo}+ units"
    return f"{lo}–{max_qty:,} units"


# ═══════════════════════════════════════════════════════════════════════
# 1. RESTRICTION CHECKER — cross-references policies.json
# ═══════════════════════════════════════════════════════════════════════


def _check_restriction(
    supplier_id: str,
    category_l1: str,
    category_l2: str,
    delivery_country: str,
    total_value: float | None,
    currency: str,
    policies: dict[str, Any],
) -> tuple[bool, str]:
    """Return (is_restricted, reason) by checking policies.json.

    The `is_restricted` flag in suppliers.csv is a hint only.
    This function is the authoritative restriction check.
    """
    for rule in policies.get("restricted_suppliers", []):
        if rule["supplier_id"] != supplier_id:
            continue
        if rule["category_l1"] != category_l1 or rule["category_l2"] != category_l2:
            continue

        scope = rule.get("restriction_scope", [])

        # SUP-0045 (Boutique Creator Network): conditional on value
        if supplier_id == "SUP-0045" and "all" in scope:
            threshold = 75_000.0
            if total_value is not None and total_value <= threshold:
                return False, ""
            return True, (
                f"{rule['restriction_reason']} "
                f"(estimated value {currency} {total_value:,.0f} exceeds {currency} {threshold:,.0f})"
                if total_value
                else rule["restriction_reason"]
            )

        # Geographic scope check
        if "all" in scope or delivery_country in scope:
            return True, rule["restriction_reason"]

    return False, ""


# ═══════════════════════════════════════════════════════════════════════
# 2. PRICING TIER LOOKUP
# ═══════════════════════════════════════════════════════════════════════


def _find_pricing_tier(
    supplier_id: str,
    category_l1: str,
    category_l2: str,
    region: str,
    quantity: int,
    pricing_index: dict,
) -> dict[str, Any] | None:
    """Find the correct pricing tier for the given quantity and region.

    Falls back to EU pricing when a CH-specific tier doesn't exist,
    since many EU-based suppliers serve Switzerland under EU pricing.

    Returns the raw pricing row or None if no tier covers this supplier/region.
    """
    # Try exact region first, then EU fallback for CH
    regions_to_try = [region]
    if region == "CH":
        regions_to_try.append("EU")

    for r in regions_to_try:
        key = (supplier_id, category_l1, category_l2, r)
        tiers = pricing_index.get(key, [])
        for tier in tiers:
            if tier["min_quantity"] <= quantity <= tier["max_quantity"]:
                return tier
    return None


# ═══════════════════════════════════════════════════════════════════════
# 3. CATEGORY & GEOGRAPHY RULE EVALUATOR
# ═══════════════════════════════════════════════════════════════════════


# Thresholds keyed by rule_type — single source of truth matching policies.json rule_text.
# If policies.json ever adds explicit threshold fields, read from there instead.
_RULE_TYPE_THRESHOLDS: dict[str, float] = {
    "mandatory_comparison": 100_000,  # CR-001: EUR/CHF 100K
    "fast_track": 75_000,  # CR-003: EUR/CHF 75K
    "security_review": 250_000,  # CR-005: EUR/CHF 250K
    "engineering_spec_review": 50,  # CR-002: 50 units
    "cv_review": 60,  # CR-007: 60 consulting days
}


def _evaluate_category_rules(
    order: CleanOrderRecap,
    total_value: float,
    policies: dict[str, Any],
) -> tuple[list[ComplianceCheck], list[Escalation]]:
    """Evaluate all category_rules from policies.json against the order."""
    checks: list[ComplianceCheck] = []
    escalations: list[Escalation] = []

    for rule in policies.get("category_rules", []):
        if rule["category_l1"] != order.category_l1:
            continue
        if rule["category_l2"] != order.category_l2:
            continue

        rule_id = rule["rule_id"]
        rule_text = rule["rule_text"]
        rule_type = rule["rule_type"]
        threshold = _RULE_TYPE_THRESHOLDS.get(rule_type)

        if rule_type == "mandatory_comparison" and threshold is not None and total_value > threshold:
            checks.append(
                ComplianceCheck(
                    rule_id=rule_id,
                    rule_description=rule_text,
                    result="warning",
                    detail=f"Total value {order.currency} {total_value:,.0f} > {threshold:,.0f} — at least 3 supplier quotes mandatory.",
                )
            )
        elif rule_type == "engineering_spec_review" and threshold is not None and order.quantity > threshold:
            checks.append(
                ComplianceCheck(
                    rule_id=rule_id,
                    rule_description=rule_text,
                    result="warning",
                    detail=f"Quantity {order.quantity} > {int(threshold)} — engineering/CAD review required.",
                )
            )
            escalations.append(
                Escalation(
                    rule_id=rule_id,
                    trigger="engineering_spec_review",
                    escalate_to="Engineering / CAD Lead",
                    blocking=True,
                    detail=rule_text,
                )
            )
        elif rule_type == "fast_track" and threshold is not None and total_value < threshold:
            checks.append(
                ComplianceCheck(
                    rule_id=rule_id,
                    rule_description=rule_text,
                    result="pass",
                    detail=f"Fast-track eligible: value {order.currency} {total_value:,.0f} < {threshold:,.0f}.",
                )
            )
        elif rule_type == "residency_check" and order.data_residency_required:
            checks.append(
                ComplianceCheck(
                    rule_id=rule_id,
                    rule_description=rule_text,
                    result="warning",
                    detail="Data residency required — only residency-compliant suppliers eligible.",
                )
            )
        elif rule_type == "security_review" and threshold is not None and total_value > threshold:
            checks.append(
                ComplianceCheck(
                    rule_id=rule_id,
                    rule_description=rule_text,
                    result="warning",
                    detail=f"Total value {order.currency} {total_value:,.0f} > {threshold:,.0f} — security architecture review required.",
                )
            )
            escalations.append(
                Escalation(
                    rule_id=rule_id,
                    trigger="security_review",
                    escalate_to="Security Architecture Review Board",
                    blocking=True,
                    detail=rule_text,
                )
            )
        elif rule_type == "design_signoff":
            checks.append(
                ComplianceCheck(
                    rule_id=rule_id,
                    rule_description=rule_text,
                    result="warning",
                    detail="Design sign-off required before award.",
                )
            )
        elif rule_type == "cv_review" and threshold is not None and order.quantity > threshold:
            checks.append(
                ComplianceCheck(
                    rule_id=rule_id,
                    rule_description=rule_text,
                    result="warning",
                    detail=f"Quantity {order.quantity} > {int(threshold)} consulting days — CV review required.",
                )
            )
        elif rule_type == "certification_check":
            checks.append(
                ComplianceCheck(
                    rule_id=rule_id,
                    rule_description=rule_text,
                    result="warning",
                    detail="Cybersecurity certification verification required before award.",
                )
            )
        elif rule_type == "performance_baseline":
            checks.append(
                ComplianceCheck(
                    rule_id=rule_id,
                    rule_description=rule_text,
                    result="warning",
                    detail="SEM proposals must include performance baseline.",
                )
            )
        elif rule_type == "brand_safety":
            checks.append(
                ComplianceCheck(
                    rule_id=rule_id,
                    rule_description=rule_text,
                    result="warning",
                    detail="Brand-safety review required before final award.",
                )
            )
            escalations.append(
                Escalation(
                    rule_id="ER-007",
                    trigger="brand_safety_review_needed",
                    escalate_to="Marketing Governance Lead",
                    blocking=True,
                    detail=rule_text,
                )
            )

    return checks, escalations


def _evaluate_geography_rules(
    order: CleanOrderRecap,
    policies: dict[str, Any],
) -> list[ComplianceCheck]:
    """Evaluate geography_rules from policies.json against the order."""
    checks: list[ComplianceCheck] = []

    for rule in policies.get("geography_rules", []):
        # Rules with a single "country" field (GR-001 to GR-004)
        if "country" in rule and rule["country"] == order.delivery_country:
            checks.append(
                ComplianceCheck(
                    rule_id=rule["rule_id"],
                    rule_description=rule.get("rule_text", rule.get("rule", "")),
                    result="warning",
                    detail=f"Geography rule applies for {order.delivery_country}.",
                )
            )
        # Rules with "countries" list (GR-005 to GR-008)
        elif "countries" in rule and order.delivery_country in rule["countries"]:
            applies_to = rule.get("applies_to", [])
            if not applies_to or order.category_l1 in applies_to:
                checks.append(
                    ComplianceCheck(
                        rule_id=rule["rule_id"],
                        rule_description=rule.get("rule", rule.get("rule_text", "")),
                        result="warning",
                        detail=f"Regional rule applies for {order.delivery_country} in {rule.get('region', 'region')}.",
                    )
                )

    return checks


# ═══════════════════════════════════════════════════════════════════════
# 4. APPROVAL THRESHOLD LOOKUP
# ═══════════════════════════════════════════════════════════════════════


def _find_approval_threshold(
    total_value: float,
    currency: str,
    policies: dict[str, Any],
) -> dict[str, Any] | None:
    """Find the applicable approval threshold for a given value + currency."""
    for t in policies.get("approval_thresholds", []):
        if t["currency"] != currency:
            continue
        max_amt = t["max_amount"]
        if max_amt is None:
            max_amt = float("inf")
        if t["min_amount"] <= total_value <= max_amt:
            return t
    return None


# ═══════════════════════════════════════════════════════════════════════
# 5. PREFERRED SUPPLIER LOOKUP
# ═══════════════════════════════════════════════════════════════════════


def _is_preferred_supplier(
    supplier_id: str,
    category_l1: str,
    category_l2: str,
    delivery_country: str,
    policies: dict[str, Any],
) -> bool:
    """Check if a supplier is preferred for this category + region."""
    region = country_to_region(delivery_country)
    for pref in policies.get("preferred_suppliers", []):
        if (
            pref["supplier_id"] == supplier_id
            and pref["category_l1"] == category_l1
            and pref["category_l2"] == category_l2
        ):
            scope = pref.get("region_scope")
            if scope is None:
                return True
            if region in scope or delivery_country in scope:
                return True
    return False


# ═══════════════════════════════════════════════════════════════════════
# 6a. FILTER — hard-constraint elimination
# ═══════════════════════════════════════════════════════════════════════


def _filter_suppliers(
    order: CleanOrderRecap,
    region: str,
    potential_suppliers: list[dict[str, Any]],
    pricing_index: dict,
    policies: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[ExcludedSupplier]]:
    """Apply hard filters and return (eligible, excluded) lists."""
    eligible: list[dict[str, Any]] = []
    excluded: list[ExcludedSupplier] = []

    for sup in potential_suppliers:
        sid = sup["supplier_id"]
        sname = sup["supplier_name"]

        if sup.get("contract_status") != "active":
            excluded.append(
                ExcludedSupplier(
                    supplier_id=sid,
                    supplier_name=sname,
                    reason=f"Contract status: {sup.get('contract_status', 'unknown')}",
                )
            )
            continue

        if order.delivery_country not in sup["service_regions"]:
            excluded.append(
                ExcludedSupplier(
                    supplier_id=sid,
                    supplier_name=sname,
                    reason=f"Does not service delivery country {order.delivery_country}. "
                    f"Covers: {', '.join(sup['service_regions'])}.",
                )
            )
            continue

        if order.data_residency_required and not sup.get("data_residency_supported", False):
            excluded.append(
                ExcludedSupplier(
                    supplier_id=sid,
                    supplier_name=sname,
                    reason="Data residency required but supplier does not support it.",
                )
            )
            continue

        if sup["capacity_per_month"] and order.quantity > sup["capacity_per_month"]:
            excluded.append(
                ExcludedSupplier(
                    supplier_id=sid,
                    supplier_name=sname,
                    reason=(
                        f"Requested quantity ({order.quantity}) exceeds monthly capacity ({sup['capacity_per_month']})."
                    ),
                )
            )
            continue

        tier = _find_pricing_tier(
            sid,
            order.category_l1,
            order.category_l2,
            region,
            order.quantity,
            pricing_index,
        )
        if tier is None:
            excluded.append(
                ExcludedSupplier(
                    supplier_id=sid,
                    supplier_name=sname,
                    reason=f"No active pricing tier for region '{region}' and quantity {order.quantity}.",
                )
            )
            continue

        total_estimate = tier["unit_price"] * order.quantity
        restricted, restriction_reason = _check_restriction(
            sid,
            order.category_l1,
            order.category_l2,
            order.delivery_country,
            total_estimate,
            order.currency,
            policies,
        )
        if restricted:
            excluded.append(
                ExcludedSupplier(
                    supplier_id=sid,
                    supplier_name=sname,
                    reason=f"Restricted: {restriction_reason}",
                )
            )
            continue

        eligible.append({**sup, "_tier": tier, "_total": total_estimate})

    return eligible, excluded


# ═══════════════════════════════════════════════════════════════════════
# 6b. SCORE — weighted composite scoring
# ═══════════════════════════════════════════════════════════════════════


def _score_suppliers(
    eligible: list[dict[str, Any]],
    order: CleanOrderRecap,
    weights: ScoringWeights,
    days_until_required: int | None,
    policies: dict[str, Any],
) -> list[dict[str, Any]]:
    """Normalise dimensions and compute composite scores."""
    if not eligible:
        return []

    prices = [c["_total"] for c in eligible]
    min_price = min(prices)

    scored: list[dict[str, Any]] = []

    for c in eligible:
        tier = c["_tier"]
        total = c["_total"]

        # Price: reciprocal proportion — cheapest gets 1.0, others get min_price/their_price.
        # e.g. cheapest=100€ → 1.0, second=150€ → 0.667 (100/150).
        price_norm = min_price / total if total > 0 else 1.0
        # Quality/Risk/ESG: absolute 0-100 scale from dataset so scores are
        # meaningful regardless of how many suppliers are being compared.
        quality_norm = c["quality_score"] / 100.0
        risk_norm = 1.0 - (c["risk_score"] / 100.0)  # lower risk → higher score
        esg_norm = c["esg_score"] / 100.0

        std_lt = tier["standard_lead_time_days"]
        exp_lt = tier["expedited_lead_time_days"]
        meets_standard = std_lt <= days_until_required if days_until_required is not None else True
        meets_expedited = exp_lt <= days_until_required if days_until_required is not None else True

        if meets_standard:
            lt_score = 1.0
        elif meets_expedited:
            lt_score = 0.5
        else:
            lt_score = 0.0

        composite = (
            weights.price * price_norm
            + weights.quality * quality_norm
            + weights.risk * risk_norm
            + weights.esg * esg_norm
            + weights.lead_time * lt_score
        )

        is_preferred = _is_preferred_supplier(
            c["supplier_id"],
            order.category_l1,
            order.category_l2,
            order.delivery_country,
            policies,
        )

        scored.append(
            {
                "supplier": c,
                "tier": tier,
                "total": total,
                "price_norm": price_norm,
                "quality_norm": quality_norm,
                "risk_norm": risk_norm,
                "esg_norm": esg_norm,
                "lt_score": lt_score,
                "composite": composite,
                "is_preferred": is_preferred,
                "meets_lead_time": meets_standard or meets_expedited,
                "meets_standard": meets_standard,
            }
        )

    scored.sort(key=lambda x: (-x["composite"], -x["is_preferred"], x["total"]))
    return scored


# ═══════════════════════════════════════════════════════════════════════
# 6c. BUILD — construct a ScoredSupplier entry for the output
# ═══════════════════════════════════════════════════════════════════════


def _build_scored_supplier(
    rank: int,
    s: dict[str, Any],
    order: CleanOrderRecap,
    cat_checks: list[ComplianceCheck],
    geo_checks: list[ComplianceCheck],
) -> ScoredSupplier:
    """Build a single ScoredSupplier entry from a scored candidate dict."""
    sup = s["supplier"]
    tier = s["tier"]

    is_order_preferred = order.preferred_supplier_id is not None and sup["supplier_id"] == order.preferred_supplier_id

    supplier_checks = list(cat_checks) + list(geo_checks)
    supplier_checks.append(
        ComplianceCheck(
            rule_id="RESTRICTION_CHECK",
            rule_description="Policy restriction verification",
            result="pass",
            detail=f"{sup['supplier_name']} is not restricted for "
            f"{order.category_l1}/{order.category_l2} in {order.delivery_country}.",
        )
    )
    if sup.get("data_residency_supported"):
        supplier_checks.append(
            ComplianceCheck(
                rule_id="DATA_RESIDENCY",
                rule_description="Data residency support",
                result="pass",
                detail="Supplier supports data residency.",
            )
        )
    elif order.data_residency_required:
        supplier_checks.append(
            ComplianceCheck(
                rule_id="DATA_RESIDENCY",
                rule_description="Data residency support",
                result="fail",
                detail="Supplier does not support data residency (should have been filtered).",
            )
        )

    tier_label = _fmt_tier(tier["min_quantity"], tier["max_quantity"])
    rationale_parts = [
        f"Rank #{rank} with composite score {s['composite']:.3f}.",
        (
            f"Pricing tier: {tier_label} "
            f"at {order.currency} {tier['unit_price']:,.4g}/unit "
            f"(total {order.currency} {s['total']:,.2f})."
        ),
    ]
    if s["is_preferred"]:
        rationale_parts.append("Preferred supplier for this category/region.")
    if is_order_preferred:
        rationale_parts.append("Matches requester's stated supplier preference.")
    if not s["meets_lead_time"]:
        rationale_parts.append(
            f"WARNING: Neither standard ({tier['standard_lead_time_days']}d) nor "
            f"expedited ({tier['expedited_lead_time_days']}d) lead time meets deadline."
        )
    elif not s["meets_standard"]:
        rationale_parts.append(
            f"Requires expedited delivery ({tier['expedited_lead_time_days']}d) "
            f"at {order.currency} {tier['expedited_unit_price']:,.2f}/unit."
        )
    rationale_parts.append(f"Quality: {sup['quality_score']}, Risk: {sup['risk_score']}, ESG: {sup['esg_score']}.")

    return ScoredSupplier(
        rank=rank,
        supplier_id=sup["supplier_id"],
        supplier_name=sup["supplier_name"],
        is_preferred=s["is_preferred"],
        is_incumbent=is_order_preferred,
        meets_lead_time=s["meets_lead_time"],
        pricing_tier_applied=tier_label,
        unit_price=tier["unit_price"],
        total_price=s["total"],
        expedited_unit_price=tier["expedited_unit_price"],
        expedited_total_price=tier["expedited_unit_price"] * order.quantity,
        standard_lead_time_days=tier["standard_lead_time_days"],
        expedited_lead_time_days=tier["expedited_lead_time_days"],
        score_breakdown=ScoreBreakdown(
            price_score=round(s["price_norm"], 4),
            quality_score=round(s["quality_norm"], 4),
            risk_score=round(s["risk_norm"], 4),
            esg_score=round(s["esg_norm"], 4),
            lead_time_score=round(s["lt_score"], 4),
        ),
        raw_scores=RawScores(
            quality=int(sup["quality_score"]),
            risk=int(sup["risk_score"]),
            esg=int(sup["esg_score"]),
        ),
        composite_score=round(s["composite"], 4),
        compliance_checks=supplier_checks,
        recommendation_note=" ".join(rationale_parts),
    )


# ═══════════════════════════════════════════════════════════════════════
# 6d. MAIN DETERMINISTIC RANKING FUNCTION
# ═══════════════════════════════════════════════════════════════════════


def rank_suppliers_deterministically(
    order: CleanOrderRecap,
    weights: ScoringWeights | None = None,
) -> RankedSupplierOutput:
    """Filter, price, score, and rank suppliers for a clean order.

    Returns a fully populated RankedSupplierOutput with audit trail.
    """
    if weights is None:
        weights = ScoringWeights()

    store = DataStore.get()
    policies = store.policies
    pricing_index = store.pricing_index

    region = country_to_region(order.delivery_country)
    if region is None:
        return RankedSupplierOutput(
            request_id=order.request_id,
            method_used=RankingMethod.DETERMINISTIC,
            scoring_weights=weights,
            currency=order.currency,
            escalations=[
                Escalation(
                    rule_id="ER-001",
                    trigger="unknown_delivery_country",
                    escalate_to="Requester Clarification",
                    blocking=True,
                    detail=f"Delivery country '{order.delivery_country}' could not be mapped to a pricing region.",
                )
            ],
        )

    days_until_required: int | None = None
    if order.required_by_date:
        days_until_required = (order.required_by_date - date.today()).days

    # ── Stage 1: Filter candidates ──────────────────────────────────

    candidates_key = (order.category_l1, order.category_l2)
    potential_suppliers = store.suppliers_by_category.get(candidates_key, [])

    eligible, excluded = _filter_suppliers(
        order,
        region,
        potential_suppliers,
        pricing_index,
        policies,
    )

    # ── Escalations from filter results ─────────────────────────────

    escalations: list[Escalation] = []

    capacity_exceeded = [e for e in excluded if "exceeds monthly capacity" in e.reason]
    if capacity_exceeded:
        escalations.append(
            Escalation(
                rule_id="ER-006",
                trigger="quantity_exceeds_capacity",
                escalate_to="Sourcing Excellence Lead",
                blocking=False,
                detail=(
                    f"Requested quantity ({order.quantity}) exceeds monthly capacity of "
                    + ", ".join(f"{e.supplier_name}" for e in capacity_exceeded)
                    + ". Alternative sourcing or split delivery may be required."
                ),
            )
        )

    if not eligible:
        escalations.append(
            Escalation(
                rule_id="ER-004",
                trigger="no_compliant_supplier_found",
                escalate_to="Head of Category",
                blocking=True,
                detail=f"No supplier passed filters for {order.category_l1}/{order.category_l2} "
                f"in {order.delivery_country}.",
            )
        )
        return RankedSupplierOutput(
            request_id=order.request_id,
            method_used=RankingMethod.DETERMINISTIC,
            scoring_weights=weights,
            currency=order.currency,
            excluded=excluded,
            escalations=escalations,
            policies_checked=[
                "restricted_suppliers",
                "category_match",
                "geography_coverage",
                "capacity",
                "data_residency",
                "contract_status",
            ],
        )

    # ── Stage 2: Score and rank ─────────────────────────────────────

    scored = _score_suppliers(eligible, order, weights, days_until_required, policies)

    # ── Stage 3: Build output ───────────────────────────────────────

    cheapest_total = scored[0]["total"] if scored else 0
    cat_checks, cat_escalations = _evaluate_category_rules(order, cheapest_total, policies)
    geo_checks = _evaluate_geography_rules(order, policies)
    escalations.extend(cat_escalations)

    threshold = _find_approval_threshold(cheapest_total, order.currency, policies)
    approval_note = None
    quotes_required = None
    threshold_id = None
    if threshold:
        threshold_id = threshold["threshold_id"]
        quotes_required = threshold["min_supplier_quotes"]
        approvers = threshold.get("managed_by", [])
        deviation = threshold.get("deviation_approval_required_from", [])
        approval_note = (
            f"Value {order.currency} {cheapest_total:,.0f} falls under {threshold_id}: "
            f"{quotes_required} quote(s) required, managed by {', '.join(approvers)}."
        )
        if deviation:
            approval_note += f" Deviation approval from: {', '.join(deviation)}."

    if order.preferred_supplier_id:
        pref_excluded = any(e.supplier_id == order.preferred_supplier_id for e in excluded)
        if pref_excluded:
            escalations.append(
                Escalation(
                    rule_id="ER-002",
                    trigger="preferred_supplier_restricted",
                    escalate_to="Procurement Manager",
                    blocking=False,
                    detail=f"Preferred supplier {order.preferred_supplier_id} was excluded from ranking.",
                )
            )

    budget_sufficient = None
    if order.budget_amount is not None and scored:
        cheapest = min(s["total"] for s in scored)
        budget_sufficient = order.budget_amount >= cheapest
        if not budget_sufficient:
            escalations.append(
                Escalation(
                    rule_id="ER-003",
                    trigger="budget_insufficient",
                    escalate_to="Head of Strategic Sourcing",
                    blocking=False,
                    detail=(
                        f"Stated budget {order.currency} {order.budget_amount:,.0f} is below "
                        f"cheapest option {order.currency} {cheapest:,.0f}."
                    ),
                )
            )

    ranking = [_build_scored_supplier(i, s, order, cat_checks, geo_checks) for i, s in enumerate(scored[:5], start=1)]

    min_cost_supplier = scored[0]["supplier"]["supplier_name"] if scored else None
    min_cost = scored[0]["total"] if scored else None

    return RankedSupplierOutput(
        request_id=order.request_id,
        method_used=RankingMethod.DETERMINISTIC,
        scoring_weights=weights,
        currency=order.currency,
        k=5,
        ranking=ranking,
        excluded=excluded,
        escalations=escalations,
        budget_sufficient=budget_sufficient,
        minimum_total_cost=min_cost,
        minimum_cost_supplier=min_cost_supplier,
        approval_threshold_id=threshold_id,
        approval_threshold_note=approval_note,
        quotes_required=quotes_required,
        policies_checked=[
            "restricted_suppliers",
            "preferred_suppliers",
            "category_rules",
            "geography_rules",
            "approval_thresholds",
            "escalation_rules",
        ],
    )


# ═══════════════════════════════════════════════════════════════════════
# 7. CONFIDENCE CHECK — determines if LLM fallback is needed
# ═══════════════════════════════════════════════════════════════════════


def needs_llm_fallback(result: RankedSupplierOutput, order: CleanOrderRecap) -> tuple[bool, str]:
    """Decide whether the deterministic result is confident enough.

    Returns (needs_fallback, reason).

    Triggers:
      - Fewer than 3 ranked suppliers when quotes_required >= 3
      - Top-2 scores within 1% of each other (tie-breaking ambiguity)
      - All suppliers exceed budget
      - Blocking escalations present
      - Data residency constraints with limited options
    """
    reasons: list[str] = []

    # Too few suppliers to meet quoting requirements
    if result.quotes_required and len(result.ranking) < result.quotes_required:
        reasons.append(f"Only {len(result.ranking)} suppliers available but {result.quotes_required} quotes required.")

    # Score ambiguity (top-2 within 1%)
    if len(result.ranking) >= 2:
        top_score = result.ranking[0].composite_score
        second_score = result.ranking[1].composite_score
        if top_score > 0 and abs(top_score - second_score) / top_score < 0.01:
            reasons.append(f"Top-2 scores are within 1% ({top_score:.4f} vs {second_score:.4f}) — ambiguous winner.")

    # Budget breach
    if result.budget_sufficient is False:
        reasons.append("All viable options exceed stated budget.")

    # Blocking escalations
    blocking = [e for e in result.escalations if e.blocking]
    if blocking:
        reasons.append(f"{len(blocking)} blocking escalation(s): " + ", ".join(e.rule_id for e in blocking))

    # Data residency with few options
    if order.data_residency_required and len(result.ranking) <= 2:
        reasons.append(f"Data residency required but only {len(result.ranking)} compliant supplier(s).")

    if reasons:
        return True, " | ".join(reasons)
    return False, ""
