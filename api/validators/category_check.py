"""Validate that category_l1 and category_l2 exist in the actual taxonomy."""

from __future__ import annotations

import difflib

from api.models import EnrichedRequest, FixAction, IssueType, Severity, ValidationIssue


def check_category(
    enriched: EnrichedRequest,
    category_index: dict[str, list[str]],
) -> list[ValidationIssue]:
    """Return issues if category_l1 or category_l2 are not in the taxonomy."""
    issues: list[ValidationIssue] = []

    l1 = enriched.category_l1
    l2 = enriched.category_l2

    # If both are empty, completeness validator already handles it
    if not l1 and not l2:
        return issues

    valid_l1s = list(category_index.keys())

    if l1 and l1 not in category_index:
        close = difflib.get_close_matches(l1, valid_l1s, n=3, cutoff=0.4)
        suggestion = close[0] if close else valid_l1s[0] if valid_l1s else None
        issues.append(
            ValidationIssue(
                issue_id="CATV-001",
                severity=Severity.CRITICAL,
                type=IssueType.CATEGORY_MISMATCH,
                description=(
                    f"Category L1 '{l1}' does not exist in the taxonomy. "
                    f"Valid categories: {', '.join(valid_l1s)}."
                ),
                proposed_fix=f"Did you mean '{suggestion}'?" if suggestion else "Please select a valid category.",
                fix_action=FixAction(
                    field="category_l1",
                    suggested_value=suggestion,
                    alternatives=close[:3] if close else valid_l1s[:3],
                ),
            )
        )
        return issues  # No point checking L2 if L1 is invalid

    if l1 and l2:
        valid_l2s = category_index.get(l1, [])
        if l2 not in valid_l2s:
            close = difflib.get_close_matches(l2, valid_l2s, n=3, cutoff=0.4)
            suggestion = close[0] if close else valid_l2s[0] if valid_l2s else None
            issues.append(
                ValidationIssue(
                    issue_id="CATV-002",
                    severity=Severity.CRITICAL,
                    type=IssueType.CATEGORY_MISMATCH,
                    description=(
                        f"Category L2 '{l2}' does not exist under '{l1}'. "
                        f"Valid sub-categories: {', '.join(valid_l2s)}."
                    ),
                    proposed_fix=f"Did you mean '{suggestion}'?" if suggestion else "Please select a valid sub-category.",
                    fix_action=FixAction(
                        field="category_l2",
                        suggested_value=suggestion,
                        alternatives=close[:3] if close else valid_l2s[:3],
                    ),
                )
            )

    return issues
