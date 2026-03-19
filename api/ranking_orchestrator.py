"""Orchestrator: routes between deterministic ranking and LLM fallback.

Flow:
  1. Run deterministic ranking engine
  2. Evaluate confidence (score spread, quoting gaps, budget, escalations)
  3. If confident → return deterministic result
  4. If ambiguous → invoke LLM fallback, merge results, return
"""

from __future__ import annotations

import logging

from api.ranking_engine import needs_llm_fallback, rank_suppliers_deterministically
from api.ranking_llm import rank_suppliers_with_llm
from api.ranking_models import (
    CleanOrderRecap,
    RankedSupplierOutput,
    RankingMethod,
    ScoringWeights,
)

logger = logging.getLogger(__name__)


async def get_top_5_suppliers(
    order: CleanOrderRecap,
    weights: ScoringWeights | None = None,
    force_llm: bool = False,
) -> RankedSupplierOutput:
    """Main entry point: produce a ranked list of up to 5 suppliers.

    Args:
        order: Cleaned and validated order recap.
        weights: Optional custom scoring weights (defaults apply if None).
        force_llm: If True, always invoke the LLM even if deterministic
                   result is confident. Useful for demo/testing.

    Returns:
        RankedSupplierOutput with full audit trail.
    """
    # ── Step 1: Deterministic ranking ───────────────────────────────
    det_result = rank_suppliers_deterministically(order, weights)

    logger.info(
        "Deterministic ranking for %s: %d suppliers ranked, %d excluded, %d escalations",
        order.request_id,
        len(det_result.ranking),
        len(det_result.excluded),
        len(det_result.escalations),
    )

    # ── Step 2: Confidence check ────────────────────────────────────
    fallback_needed, fallback_reason = needs_llm_fallback(det_result, order)

    if not fallback_needed and not force_llm:
        logger.info(
            "Deterministic result is confident for %s — returning directly.",
            order.request_id,
        )
        return det_result

    # ── Step 3: LLM fallback ───────────────────────────────────────
    if not det_result.ranking:
        # No suppliers to re-rank — LLM can't help, return as-is
        logger.warning(
            "No ranked suppliers for %s — skipping LLM fallback.", order.request_id,
        )
        return det_result

    reason = fallback_reason if fallback_needed else "force_llm=True (manual override)"
    logger.info(
        "Invoking LLM fallback for %s. Reason: %s", order.request_id, reason,
    )

    try:
        llm_result = await rank_suppliers_with_llm(order, det_result, reason)
        logger.info(
            "LLM fallback complete for %s: %d suppliers re-ranked.",
            order.request_id, len(llm_result.ranking),
        )
        return llm_result

    except (Exception) as exc:
        # LLM failure is non-fatal — fall back to deterministic result.
        # Narrow to expected failures; re-raise truly unexpected ones.
        expected = (
            OSError,          # network / timeout
            ValueError,       # JSON / parsing
            KeyError,         # missing fields
        )
        if not isinstance(exc, expected):
            # Also allow pydantic ValidationError and openai errors
            exc_mod = type(exc).__module__
            if not any(
                exc_mod.startswith(pfx)
                for pfx in ("pydantic", "openai", "langchain")
            ):
                raise

        logger.exception(
            "LLM fallback failed for %s — returning deterministic result.",
            order.request_id,
        )
        return det_result.model_copy(update={
            "llm_fallback_reason": f"LLM invocation failed: {reason}",
            "method_used": RankingMethod.HYBRID,
        })
