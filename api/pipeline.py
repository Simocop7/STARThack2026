"""Orchestrate the 3-stage pipeline: Interpret → Validate → Message."""

from __future__ import annotations

import asyncio
import logging
import types
from typing import Any, Union, get_args, get_origin

from api.data_loader import DataStore

logger = logging.getLogger(__name__)

# ANSI colours for terminal output
_R = "\033[0m"       # reset
_BOLD = "\033[1m"
_CYAN = "\033[96m"
_GREEN = "\033[92m"
_YELLOW = "\033[93m"
_RED = "\033[91m"
_DIM = "\033[2m"


def _log(symbol: str, colour: str, label: str, detail: str = "") -> None:
    msg = f"{colour}{_BOLD}{symbol} {label}{_R}"
    if detail:
        msg += f"  {_DIM}{detail}{_R}"
    print(msg, flush=True)


from api.interpreter import interpret_request
from api.message_generator import generate_user_message
from api.models import (
    EnrichedRequest,
    FixAction,
    FormInput,
    IssueType,
    Severity,
    UserMessage,
    UserMessageIssue,
    ValidationIssue,
    ValidationResult,
)
from api.validators.category_check import check_category
from api.validators.completeness import check_completeness
from api.validators.contradiction import check_contradictions
from api.validators.lead_time import check_lead_time
from api.validators.policy_rules import check_policy_rules
from api.validators.supplier_checker import check_supplier

_LLM_TIMEOUT_SECONDS = 25.0


def _apply_fixes(
    enriched: EnrichedRequest,
    issues: list[ValidationIssue],
) -> dict[str, Any]:
    """Build a corrected copy of the enriched request with all fixes applied."""
    data = enriched.model_dump(mode="json")
    field_types = {name: info.annotation for name, info in EnrichedRequest.model_fields.items()}

    for issue in issues:
        if issue.fix_action and issue.fix_action.suggested_value:
            field = issue.fix_action.field
            value: Any = issue.fix_action.suggested_value
            if field not in data:
                continue
            target_type = field_types.get(field)
            origin = get_origin(target_type)
            if origin is Union or isinstance(target_type, types.UnionType):
                inner = [t for t in get_args(target_type) if t is not type(None)]
                target_type = inner[0] if inner else target_type
            if target_type is int:
                try:
                    value = int(value)
                except (ValueError, TypeError):
                    pass
            elif target_type is float:
                try:
                    value = float(value)
                except (ValueError, TypeError):
                    pass
            elif target_type is bool and isinstance(value, str):
                value = value.lower() in ("true", "1", "yes")
            data[field] = value

    return data


def _fallback_enriched(form_input: FormInput) -> EnrichedRequest:
    """Build a minimal EnrichedRequest from raw form fields when LLM is unavailable."""
    return EnrichedRequest(
        request_text=form_input.request_text,
        quantity=form_input.quantity,
        unit_of_measure=form_input.unit_of_measure,
        category_l1=form_input.category_l1 or None,
        category_l2=form_input.category_l2 or None,
        delivery_country=form_input.delivery_country,
        required_by_date=form_input.required_by_date,
        preferred_supplier=form_input.preferred_supplier,
        item_description=form_input.request_text[:200],
        detected_language=form_input.language,
    )


def _fallback_user_message(
    issues: list[ValidationIssue],
    language: str,
) -> UserMessage:
    """Build a UserMessage from raw issues when LLM message generation fails."""
    blocking = [i for i in issues if i.severity in (Severity.CRITICAL, Severity.HIGH)]
    n = len(blocking)
    summary = (
        f"We found {n} issue{'s' if n != 1 else ''} with your request that need{'s' if n == 1 else ''} attention."
        if n > 0
        else "Your request looks good!"
    )
    msg_issues = [
        UserMessageIssue(
            title=i.type.value.replace("_", " ").title(),
            explanation=i.description,
            proposed_fix=i.proposed_fix,
            fix_field=i.fix_action.field if i.fix_action else None,
            fix_value=i.fix_action.suggested_value if i.fix_action else None,
        )
        for i in blocking
    ]
    return UserMessage(
        summary=summary,
        issues=msg_issues,
        all_ok_message="Your request is ready to submit." if n == 0 else "",
    )


async def process_request(form_input: FormInput) -> ValidationResult:
    """Run the full 3-stage pipeline."""
    store = DataStore.get()

    desc_preview = (form_input.request_text or "")[:80].replace("\n", " ")
    print(flush=True)
    _log("▶", _CYAN, "PIPELINE START", f'"{desc_preview}{"…" if len(form_input.request_text or "") > 80 else ""}"')

    # ── Stage 1: LLM interpretation (with graceful degradation) ──
    _log("1/3", _CYAN, "LLM Interpretation", "sending request to Azure OpenAI …")
    try:
        enriched = await asyncio.wait_for(
            interpret_request(
                form_input,
                categories=store.categories,
                suppliers=store.suppliers,
            ),
            timeout=_LLM_TIMEOUT_SECONDS,
        )
        _log("  ✓", _GREEN, "Interpreted",
             f"category={enriched.category_l1}/{enriched.category_l2}  "
             f"qty={enriched.quantity}  country={enriched.delivery_country}  "
             f"urgency={enriched.urgency}")
    except Exception:
        logger.exception("LLM interpretation failed — falling back to raw form data")
        _log("  !", _YELLOW, "LLM failed", "using raw form data as fallback")
        enriched = _fallback_enriched(form_input)

    # If the form had a preferred_supplier text but the LLM couldn't resolve it,
    # try our own fuzzy lookup
    if form_input.preferred_supplier and not enriched.preferred_supplier_id:
        resolved_id = store.get_supplier_id(form_input.preferred_supplier)
        if resolved_id:
            enriched = enriched.model_copy(
                update={
                    "preferred_supplier_id": resolved_id,
                    "preferred_supplier_name": store.get_supplier_name(resolved_id),
                }
            )
            _log("  ✓", _GREEN, "Preferred supplier resolved", store.get_supplier_name(resolved_id))

    # ── Category disambiguation check ──
    cat_suggestion = enriched.category_suggestion
    user_confirmed_category = bool(form_input.category_l1 and form_input.category_l2)
    if cat_suggestion and cat_suggestion.needs_disambiguation and not user_confirmed_category:
        _log("  !", _YELLOW, "Category ambiguous",
             f"{cat_suggestion.category_l1}/{cat_suggestion.category_l2} ({cat_suggestion.confidence:.0%} confidence)")
        conf = cat_suggestion.confidence
        if conf < 0.5:
            proposed_fix = "Please confirm or select the correct category."
        else:
            proposed_fix = (
                "Your request is ambiguous — please reformulate it in a more precise manner "
                "so the correct category can be determined with confidence."
            )
        issues_pre: list[ValidationIssue] = [
            ValidationIssue(
                issue_id="CAT-001",
                severity=Severity.HIGH,
                type=IssueType.CATEGORY_AMBIGUOUS,
                description=(
                    f"Category auto-detected as '{cat_suggestion.category_l1} > {cat_suggestion.category_l2}' "
                    f"with {cat_suggestion.confidence:.0%} confidence. "
                    f"Reason: {cat_suggestion.reasoning}"
                ),
                proposed_fix=proposed_fix,
                fix_action=FixAction(
                    field="category_l2",
                    suggested_value=cat_suggestion.category_l2,
                    alternatives=[a.category_l2 for a in cat_suggestion.alternatives],
                ),
            )
        ]
    else:
        issues_pre = []

    # ── Stage 2: Deterministic validation ──
    _log("2/3", _CYAN, "Validation", "running validators …")
    issues: list[ValidationIssue] = issues_pre

    completeness_issues = check_completeness(enriched)
    issues.extend(completeness_issues)
    _log("  ·", _DIM, "completeness",
         f"{len(completeness_issues)} issue(s)" if completeness_issues else "OK")

    issues.extend(check_category(enriched, store.category_index))

    supplier_issues = check_supplier(
        enriched,
        suppliers_by_category=store.suppliers_by_category,
        supplier_by_key=store.supplier_by_key,
        policies=store.policies,
    )
    issues.extend(supplier_issues)
    _log("  ·", _DIM, "supplier eligibility",
         f"{len(supplier_issues)} issue(s)" if supplier_issues else "OK")

    lead_time_issues = check_lead_time(
        enriched,
        pricing_index=store.pricing_index,
        suppliers_by_category=store.suppliers_by_category,
    )
    issues.extend(lead_time_issues)
    _log("  ·", _DIM, "lead time",
         f"{len(lead_time_issues)} issue(s)" if lead_time_issues else "OK")

    contradiction_issues = check_contradictions(enriched, form_input)
    issues.extend(contradiction_issues)
    _log("  ·", _DIM, "contradictions",
         f"{len(contradiction_issues)} issue(s)" if contradiction_issues else "OK")

    policy_issues = check_policy_rules(enriched, store.policies)
    issues.extend(policy_issues)
    _log("  ·", _DIM, "policy rules",
         f"{len(policy_issues)} issue(s)" if policy_issues else "OK")

    is_valid = not any(i.severity in (Severity.CRITICAL, Severity.HIGH) for i in issues)

    critical_count = sum(1 for i in issues if i.severity == Severity.CRITICAL)
    high_count = sum(1 for i in issues if i.severity == Severity.HIGH)
    total_issues = len(issues)
    if is_valid:
        _log("  ✓", _GREEN, "Validation PASSED", f"{total_issues} issue(s) total (none blocking)")
    else:
        _log("  ✗", _RED, "Validation FAILED",
             f"{critical_count} critical  {high_count} high  {total_issues} total")

    corrected = _apply_fixes(enriched, issues)

    # ── Stage 3: LLM message generation (with graceful degradation) ──
    blocking_issues = [i for i in issues if i.severity in (Severity.CRITICAL, Severity.HIGH)]
    if blocking_issues:
        _log("3/3", _CYAN, "Message generation",
             f"generating user-facing explanation for {len(blocking_issues)} blocking issue(s) …")
    else:
        _log("3/3", _CYAN, "Message generation", "no blocking issues — generating summary …")

    try:
        user_message = await asyncio.wait_for(
            generate_user_message(
                enriched,
                blocking_issues,
                corrected,
                language=form_input.language,
            ),
            timeout=_LLM_TIMEOUT_SECONDS,
        )
        _log("  ✓", _GREEN, "Message ready", f"language={form_input.language}")
    except Exception:
        logger.exception("LLM message generation failed — using fallback message")
        _log("  !", _YELLOW, "LLM failed", "using fallback message")
        user_message = _fallback_user_message(issues, form_input.language)

    result_label = _GREEN + "✔ CAN PROCEED" if is_valid else _RED + "✘ BLOCKED"
    _log("◀", _CYAN, "PIPELINE DONE", f"{result_label}{_R}")
    print(flush=True)

    return ValidationResult(
        is_valid=is_valid,
        issues=issues,
        enriched_request=enriched,
        corrected_request=corrected,
        user_message=user_message,
        category_suggestion=cat_suggestion,
    )
