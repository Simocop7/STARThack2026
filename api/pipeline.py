"""Orchestrate the 3-stage pipeline: Interpret → Validate → Message."""

from __future__ import annotations

from typing import Any

from api.data_loader import DataStore
from api.interpreter import interpret_request
from api.message_generator import generate_user_message
from api.models import (
    EnrichedRequest,
    FormInput,
    Severity,
    ValidationIssue,
    ValidationResult,
)
from api.validators.completeness import check_completeness
from api.validators.contradiction import check_contradictions
from api.validators.lead_time import check_lead_time
from api.validators.policy_rules import check_policy_rules
from api.validators.supplier_checker import check_supplier


def _apply_fixes(
    enriched: EnrichedRequest,
    issues: list[ValidationIssue],
) -> dict[str, Any]:
    """Build a corrected copy of the enriched request with all fixes applied."""
    data = enriched.model_dump(mode="json")

    for issue in issues:
        if issue.fix_action and issue.fix_action.suggested_value:
            field = issue.fix_action.field
            value = issue.fix_action.suggested_value
            if field in data:
                data[field] = value

    return data


async def process_request(form_input: FormInput) -> ValidationResult:
    """Run the full 3-stage pipeline."""
    store = DataStore.get()

    # ── Stage 1: LLM interpretation ──
    enriched = await interpret_request(
        form_input,
        categories=store.categories,
        suppliers=store.suppliers,
    )

    # If the form had a preferred_supplier text but the LLM couldn't resolve it,
    # try our own fuzzy lookup
    if form_input.preferred_supplier and not enriched.preferred_supplier_id:
        resolved_id = store.get_supplier_id(form_input.preferred_supplier)
        if resolved_id:
            enriched.preferred_supplier_id = resolved_id
            enriched.preferred_supplier_name = store.get_supplier_name(resolved_id)

    # ── Stage 2: Deterministic validation ──
    issues: list[ValidationIssue] = []

    issues.extend(check_completeness(enriched))

    issues.extend(check_supplier(
        enriched,
        suppliers_by_category=store.suppliers_by_category,
        supplier_by_key=store.supplier_by_key,
        policies=store.policies,
    ))

    issues.extend(check_lead_time(
        enriched,
        pricing_index=store.pricing_index,
        suppliers_by_category=store.suppliers_by_category,
    ))

    issues.extend(check_contradictions(enriched, form_input))

    issues.extend(check_policy_rules(enriched, store.policies))

    is_valid = not any(
        i.severity in (Severity.CRITICAL, Severity.HIGH) for i in issues
    )

    corrected = _apply_fixes(enriched, issues)

    # ── Stage 3: LLM message generation ──
    user_message = await generate_user_message(
        enriched,
        issues,
        corrected,
        language=enriched.detected_language,
    )

    return ValidationResult(
        is_valid=is_valid,
        issues=issues,
        enriched_request=enriched,
        corrected_request=corrected,
        user_message=user_message,
    )
