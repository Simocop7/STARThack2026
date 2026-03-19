"""Pydantic models for the Supplier Ranking Engine.

All output models are designed to be audit-ready: every scoring decision,
pricing tier selection, and compliance check is recorded so that procurement
reviewers can trace exactly why a supplier was ranked (or excluded).
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Input: Clean Order Recap (from the Procurement Office) ─────────────


class CleanOrderRecap(BaseModel):
    """Structured order received from the intake/validation pipeline.

    All ambiguity has already been resolved upstream — this model
    represents a single, unambiguous procurement need.
    """

    request_id: str = Field(..., description="Unique request identifier (REQ-XXXXXX)")
    category_l1: str = Field(..., description="Top-level category (IT, Facilities, …)")
    category_l2: str = Field(..., description="Sub-category (Laptops, Cloud Compute, …)")
    quantity: int = Field(..., gt=0, description="Number of units required")
    unit_of_measure: str = Field(default="unit", description="e.g. device, license, day")
    budget_amount: Optional[float] = Field(None, description="Stated budget in order currency")
    currency: str = Field(default="EUR", description="ISO currency code (EUR, CHF, USD)")
    delivery_country: str = Field(..., description="ISO country code for delivery")
    required_by_date: Optional[date] = Field(None, description="Deadline for delivery")
    data_residency_required: bool = Field(default=False)
    esg_requirement: bool = Field(default=False)
    preferred_supplier_id: Optional[str] = Field(None, description="SUP-XXXX if stated")
    preferred_supplier_name: Optional[str] = Field(None)


# ── Scoring breakdown (for audit transparency) ────────────────────────


class ScoringWeights(BaseModel):
    """Weights used for the composite score — recorded for reproducibility."""

    price: float = 0.35
    quality: float = 0.25
    risk: float = 0.15
    esg: float = 0.10
    lead_time: float = 0.15


class ScoreBreakdown(BaseModel):
    """Per-dimension normalised scores (0–1) before weighting."""

    price_score: float = Field(..., ge=0, le=1)
    quality_score: float = Field(..., ge=0, le=1)
    risk_score: float = Field(..., ge=0, le=1, description="Inverted: 1 = lowest risk")
    esg_score: float = Field(..., ge=0, le=1)
    lead_time_score: float = Field(..., ge=0, le=1)


# ── Compliance check log (attached per supplier) ──────────────────────


class ComplianceCheck(BaseModel):
    """Single policy/rule evaluation result — keeps the audit trail tight."""

    rule_id: str
    rule_description: str
    result: str = Field(..., description="pass | fail | warning | not_applicable")
    detail: str = Field(default="", description="Human-readable explanation")


# ── Per-supplier ranking entry ─────────────────────────────────────────


class ScoredSupplier(BaseModel):
    """A supplier that passed all hard filters and received a score."""

    rank: int
    supplier_id: str
    supplier_name: str

    # Status flags
    is_preferred: bool = False
    is_incumbent: bool = False
    meets_lead_time: bool = True

    # Pricing details
    pricing_tier_applied: str = Field(..., description="e.g. '100-499 units'")
    unit_price: float
    total_price: float
    expedited_unit_price: Optional[float] = None
    expedited_total_price: Optional[float] = None
    standard_lead_time_days: int
    expedited_lead_time_days: Optional[int] = None

    # Scores
    score_breakdown: ScoreBreakdown
    composite_score: float

    # Compliance
    compliance_checks: list[ComplianceCheck] = Field(default_factory=list)

    # Audit rationale — the most important field for the judges
    recommendation_note: str = Field(
        ...,
        description=(
            "Human-readable rationale: why this rank, which tier, "
            "which checks passed/failed."
        ),
    )


# ── Excluded suppliers (for audit) ─────────────────────────────────────


class ExcludedSupplier(BaseModel):
    supplier_id: str
    supplier_name: str
    reason: str


# ── Escalation ─────────────────────────────────────────────────────────


class Escalation(BaseModel):
    rule_id: str
    trigger: str
    escalate_to: str
    blocking: bool = False
    detail: str = ""


# ── Top-level output ───────────────────────────────────────────────────


class RankingMethod(str, Enum):
    DETERMINISTIC = "deterministic"
    LLM_FALLBACK = "llm_fallback"
    HYBRID = "hybrid"


class RankedSupplierOutput(BaseModel):
    """Complete ranking response — ready for the UI and for audit review."""

    request_id: str
    ranked_at: datetime = Field(default_factory=datetime.utcnow)
    method_used: RankingMethod = RankingMethod.DETERMINISTIC

    # Parameters
    k: int = 5
    scoring_weights: ScoringWeights = Field(default_factory=ScoringWeights)

    # Results
    ranking: list[ScoredSupplier] = Field(default_factory=list)
    excluded: list[ExcludedSupplier] = Field(default_factory=list)
    escalations: list[Escalation] = Field(default_factory=list)

    # Budget analysis
    budget_sufficient: Optional[bool] = None
    minimum_total_cost: Optional[float] = None
    minimum_cost_supplier: Optional[str] = None

    # Approval threshold
    approval_threshold_id: Optional[str] = None
    approval_threshold_note: Optional[str] = None
    quotes_required: Optional[int] = None

    # Audit
    policies_checked: list[str] = Field(default_factory=list)
    llm_fallback_reason: Optional[str] = None
