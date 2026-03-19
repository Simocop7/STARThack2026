"""LangChain-powered LLM fallback for supplier ranking.

Used when the deterministic engine produces ambiguous results (score ties,
budget overruns, complex data-residency constraints, or insufficient
suppliers to meet quoting requirements).

The LLM receives the filtered supplier data and order constraints, then
returns a structured JSON ranking via a PydanticOutputParser.
"""

from __future__ import annotations

import json
import os
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_openai import AzureChatOpenAI
from pydantic import BaseModel, Field

from api.ranking_models import (
    CleanOrderRecap,
    Escalation,
    RankedSupplierOutput,
    RankingMethod,
    ScoredSupplier,
)


# ── LLM output schema (subset — the LLM fills these fields) ──────────


class LLMSupplierRanking(BaseModel):
    """Structured output the LLM must produce."""

    class LLMRankedEntry(BaseModel):
        rank: int = Field(..., description="1-based rank")
        supplier_id: str
        supplier_name: str
        recommended: bool = Field(
            ..., description="True if the LLM recommends this supplier"
        )
        rationale: str = Field(
            ...,
            description=(
                "Detailed audit-ready explanation: why this rank, "
                "trade-offs considered, compliance notes."
            ),
        )
        adjusted_composite_score: float = Field(
            ..., ge=0, le=1,
            description="LLM-adjusted composite score (0-1)",
        )

    ranking: list[LLMRankedEntry] = Field(
        ..., min_length=1, max_length=5,
        description="Ranked list of up to 5 suppliers",
    )
    overall_assessment: str = Field(
        ...,
        description=(
            "High-level summary of the sourcing situation: key risks, "
            "trade-offs, and whether proceeding is advisable."
        ),
    )
    additional_escalations: list[str] = Field(
        default_factory=list,
        description="Any additional escalations the LLM identifies",
    )


# ── Prompt template ───────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a senior procurement analyst AI. Your task is to re-rank and evaluate \
a shortlist of suppliers for a purchase request. The deterministic scoring \
engine was unable to produce a confident ranking, so you must apply \
professional judgement.

## Your responsibilities:
1. Analyse each supplier's pricing, quality, risk, ESG scores, and lead times.
2. Consider the requester's constraints (budget, deadline, data residency, preferences).
3. Apply procurement best practices: value for money, risk mitigation, compliance.
4. Produce an audit-ready ranking with detailed rationale for EACH supplier.
5. Flag any additional risks or escalations you identify.

## Rules you MUST follow:
- Never recommend a restricted supplier.
- If budget is insufficient for all options, still rank them but note the shortfall.
- If lead time cannot be met, note whether expedited delivery resolves it.
- Preferred suppliers should be favoured ONLY if commercially competitive.
- Your rationale must be specific and quantified (mention actual prices, scores, days).

{format_instructions}
"""

_USER_PROMPT = """\
## Purchase Request
```json
{order_json}
```

## Deterministic Engine Context
Fallback reason: {fallback_reason}

## Shortlisted Suppliers (passed hard filters)
```json
{suppliers_json}
```

## Scoring Weights Used
Price: {w_price}, Quality: {w_quality}, Risk: {w_risk}, ESG: {w_esg}, Lead Time: {w_lead_time}

Please analyse the trade-offs and produce your structured ranking.
"""


# ── LLM ranking function ─────────────────────────────────────────────


async def rank_suppliers_with_llm(
    order: CleanOrderRecap,
    deterministic_result: RankedSupplierOutput,
    fallback_reason: str,
) -> RankedSupplierOutput:
    """Call the LLM to re-rank suppliers when deterministic scoring is ambiguous.

    Takes the deterministic result (which has the shortlisted suppliers and
    their scores) and asks the LLM to apply professional judgement.

    Returns an updated RankedSupplierOutput with method_used=LLM_FALLBACK.
    """
    parser = PydanticOutputParser(pydantic_object=LLMSupplierRanking)

    prompt = PromptTemplate(
        template=_SYSTEM_PROMPT + "\n\n" + _USER_PROMPT,
        input_variables=[
            "order_json", "fallback_reason", "suppliers_json",
            "w_price", "w_quality", "w_risk", "w_esg", "w_lead_time",
        ],
        partial_variables={
            "format_instructions": parser.get_format_instructions(),
        },
    )

    # Prepare supplier data for the LLM
    suppliers_for_llm = []
    for s in deterministic_result.ranking:
        suppliers_for_llm.append({
            "supplier_id": s.supplier_id,
            "supplier_name": s.supplier_name,
            "is_preferred": s.is_preferred,
            "unit_price": s.unit_price,
            "total_price": s.total_price,
            "expedited_unit_price": s.expedited_unit_price,
            "expedited_total_price": s.expedited_total_price,
            "standard_lead_time_days": s.standard_lead_time_days,
            "expedited_lead_time_days": s.expedited_lead_time_days,
            "meets_lead_time": s.meets_lead_time,
            "score_breakdown": {
                "price": s.score_breakdown.price_score,
                "quality": s.score_breakdown.quality_score,
                "risk": s.score_breakdown.risk_score,
                "esg": s.score_breakdown.esg_score,
                "lead_time": s.score_breakdown.lead_time_score,
            },
            "deterministic_score": s.composite_score,
            "pricing_tier": s.pricing_tier_applied,
        })

    weights = deterministic_result.scoring_weights

    # Build the LangChain chain — route through Azure, not api.openai.com
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    if not endpoint or not api_key:
        raise ValueError(
            "Missing required environment variables: AZURE_OPENAI_ENDPOINT and/or AZURE_OPENAI_API_KEY"
        )
    llm = AzureChatOpenAI(
        azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o"),
        azure_endpoint=endpoint,
        api_key=api_key,
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
        temperature=0.1,
        max_tokens=2000,
    )

    chain = prompt | llm | parser

    # Invoke
    llm_output: LLMSupplierRanking = await chain.ainvoke({
        "order_json": order.model_dump_json(indent=2),
        "fallback_reason": fallback_reason,
        "suppliers_json": json.dumps(suppliers_for_llm, indent=2),
        "w_price": weights.price,
        "w_quality": weights.quality,
        "w_risk": weights.risk,
        "w_esg": weights.esg,
        "w_lead_time": weights.lead_time,
    })

    # ── Merge LLM output back into the structured result ──────────

    # Build a lookup from the deterministic result
    det_map = {s.supplier_id: s for s in deterministic_result.ranking}

    new_ranking: list[ScoredSupplier] = []
    for entry in llm_output.ranking:
        original = det_map.get(entry.supplier_id)
        if original is None:
            continue

        new_ranking.append(ScoredSupplier(
            rank=entry.rank,
            supplier_id=original.supplier_id,
            supplier_name=original.supplier_name,
            is_preferred=original.is_preferred,
            is_incumbent=original.is_incumbent,
            meets_lead_time=original.meets_lead_time,
            pricing_tier_applied=original.pricing_tier_applied,
            unit_price=original.unit_price,
            total_price=original.total_price,
            expedited_unit_price=original.expedited_unit_price,
            expedited_total_price=original.expedited_total_price,
            standard_lead_time_days=original.standard_lead_time_days,
            expedited_lead_time_days=original.expedited_lead_time_days,
            score_breakdown=original.score_breakdown,
            composite_score=round(entry.adjusted_composite_score, 4),
            compliance_checks=original.compliance_checks,
            recommendation_note=entry.rationale,
        ))

    # Additional escalations from LLM
    additional_escalations = [
        Escalation(
            rule_id="LLM-ESC",
            trigger="llm_identified_risk",
            escalate_to="Procurement Manager",
            blocking=False,
            detail=esc,
        )
        for esc in llm_output.additional_escalations
    ]

    return RankedSupplierOutput(
        request_id=deterministic_result.request_id,
        method_used=RankingMethod.LLM_FALLBACK,
        scoring_weights=deterministic_result.scoring_weights,
        k=deterministic_result.k,
        ranking=new_ranking,
        excluded=deterministic_result.excluded,
        escalations=deterministic_result.escalations + additional_escalations,
        budget_sufficient=deterministic_result.budget_sufficient,
        minimum_total_cost=deterministic_result.minimum_total_cost,
        minimum_cost_supplier=deterministic_result.minimum_cost_supplier,
        approval_threshold_id=deterministic_result.approval_threshold_id,
        approval_threshold_note=deterministic_result.approval_threshold_note,
        quotes_required=deterministic_result.quotes_required,
        policies_checked=deterministic_result.policies_checked + ["llm_evaluation"],
        llm_fallback_reason=fallback_reason,
    )
