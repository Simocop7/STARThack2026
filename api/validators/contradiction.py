"""Detect contradictions between free text and structured form fields."""

from __future__ import annotations

from api.models import EnrichedRequest, FixAction, FormInput, IssueType, Severity, ValidationIssue


def check_contradictions(
    enriched: EnrichedRequest,
    form_input: FormInput,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    counter = 0

    # --- Quantity mismatch (text vs form) ---
    if (
        enriched.text_quantity_mentioned is not None
        and form_input.quantity is not None
        and enriched.text_quantity_mentioned != form_input.quantity
    ):
        counter += 1
        text_qty = enriched.text_quantity_mentioned
        form_qty = form_input.quantity
        # Suggest the more plausible value (text is usually more intentional)
        suggested = str(text_qty)
        issues.append(
            ValidationIssue(
                issue_id=f"CTR-{counter:03d}",
                severity=Severity.HIGH,
                type=IssueType.CONTRADICTORY,
                description=(
                    f"The text mentions {text_qty} units but the quantity "
                    f"field says {form_qty}."
                ),
                proposed_fix=(
                    f"Which quantity is correct? The text says {text_qty}, "
                    f"the form says {form_qty}."
                ),
                fix_action=FixAction(
                    field="quantity",
                    suggested_value=suggested,
                    alternatives=[str(form_qty)],
                ),
            )
        )

    # --- LLM-detected contradictions ---
    for contradiction in enriched.text_contradictions:
        counter += 1
        issues.append(
            ValidationIssue(
                issue_id=f"CTR-{counter:03d}",
                severity=Severity.MEDIUM,
                type=IssueType.CONTRADICTORY,
                description=contradiction.explanation,
                proposed_fix=(
                    f"Field '{contradiction.field}': form says "
                    f"'{contradiction.form_value}', text says "
                    f"'{contradiction.text_value}'. Please verify."
                ),
                fix_action=FixAction(
                    field=contradiction.field,
                    suggested_value=contradiction.text_value,
                    alternatives=[contradiction.form_value],
                ),
            )
        )

    return issues
