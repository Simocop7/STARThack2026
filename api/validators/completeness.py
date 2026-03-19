"""Check that all required fields are present and non-empty."""

from __future__ import annotations

from api.models import EnrichedRequest, FixAction, IssueType, Severity, ValidationIssue

_REQUIRED_FIELDS = {
    "quantity": "Quantity (number of items/units)",
    "category_l1": "Category L1 (auto-detected from your description)",
    "category_l2": "Category L2 (auto-detected from your description)",
    "delivery_address": "Delivery address",
    "delivery_country": "Delivery country (could not determine country from address)",
    "required_by_date": "Required-by date",
}


def check_completeness(enriched: EnrichedRequest) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    counter = 0

    for field, label in _REQUIRED_FIELDS.items():
        value = getattr(enriched, field, None)
        if value is None or value == "" or value == 0:
            counter += 1
            issues.append(
                ValidationIssue(
                    issue_id=f"COMP-{counter:03d}",
                    severity=Severity.CRITICAL,
                    type=IssueType.MISSING_INFO,
                    description=f"Required field '{label}' is missing or empty.",
                    proposed_fix=f"Please provide a value for '{label}'.",
                    fix_action=FixAction(field=field),
                )
            )

    # Conditionally require unit_of_measure when LLM says it's needed
    if enriched.unit_of_measure_required and not enriched.unit_of_measure:
        counter += 1
        issues.append(
            ValidationIssue(
                issue_id=f"COMP-{counter:03d}",
                severity=Severity.HIGH,
                type=IssueType.MISSING_INFO,
                description="Unit of measure is required for this type of item (e.g. kg, liters, meters) but was not provided.",
                proposed_fix="Please specify the unit of measure for the requested items.",
                fix_action=FixAction(field="unit_of_measure"),
            )
        )

    if enriched.quantity is not None and enriched.quantity < 0:
        counter += 1
        issues.append(
            ValidationIssue(
                issue_id=f"COMP-{counter:03d}",
                severity=Severity.CRITICAL,
                type=IssueType.MISSING_INFO,
                description=f"Quantity cannot be negative (got {enriched.quantity}).",
                proposed_fix="Correct the quantity to a positive number.",
                fix_action=FixAction(field="quantity"),
            )
        )

    return issues
