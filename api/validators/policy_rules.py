"""Check category rules and geography rules (informational, not blocking)."""

from __future__ import annotations

from typing import Any

from api.models import EnrichedRequest, IssueType, Severity, ValidationIssue


def check_policy_rules(
    enriched: EnrichedRequest,
    policies: dict[str, Any],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    counter = 0

    cat_l1 = enriched.category_l1
    cat_l2 = enriched.category_l2
    country = enriched.delivery_country
    quantity = enriched.quantity

    # --- Category rules ---
    for rule in policies.get("category_rules", []):
        if rule["category_l1"] != cat_l1 or rule["category_l2"] != cat_l2:
            continue

        rule_id = rule["rule_id"]
        rule_type = rule["rule_type"]
        rule_text = rule["rule_text"]

        # Check quantity-based triggers
        if rule_id == "CR-002" and quantity is not None and quantity > 50:
            counter += 1
            issues.append(
                _info_issue(
                    f"POL-{counter:03d}",
                    rule_id,
                    rule_type,
                    rule_text,
                )
            )
        elif rule_id == "CR-007" and quantity is not None and quantity > 60:
            counter += 1
            issues.append(
                _info_issue(
                    f"POL-{counter:03d}",
                    rule_id,
                    rule_type,
                    rule_text,
                )
            )
        elif rule_id in ("CR-006", "CR-008", "CR-009", "CR-010"):
            # Always applies for the matching category
            counter += 1
            issues.append(
                _info_issue(
                    f"POL-{counter:03d}",
                    rule_id,
                    rule_type,
                    rule_text,
                )
            )
        elif rule_id == "CR-004" and enriched.data_residency_required:
            counter += 1
            issues.append(
                _info_issue(
                    f"POL-{counter:03d}",
                    rule_id,
                    rule_type,
                    rule_text,
                )
            )

    # --- Geography rules ---
    for rule in policies.get("geography_rules", []):
        # GR-001 to GR-004 use "country" field
        rule_country = rule.get("country")
        rule_countries = rule.get("countries", [])

        applies = False
        if rule_country and country == rule_country:
            applies = True
        elif rule_countries and country in rule_countries:
            # GR-005 to GR-008 check applies_to category
            applies_to = rule.get("applies_to", [])
            if not applies_to or cat_l1 in applies_to:
                applies = True

        if applies:
            counter += 1
            rule_text = rule.get("rule_text", rule.get("rule", ""))
            issues.append(
                ValidationIssue(
                    issue_id=f"POL-{counter:03d}",
                    severity=Severity.INFO,
                    type=IssueType.POLICY_NOTE,
                    description=f"[{rule['rule_id']}] {rule_text}",
                    proposed_fix="No action required — informational note for compliance.",
                )
            )

    return issues


def _info_issue(
    issue_id: str,
    rule_id: str,
    rule_type: str,
    rule_text: str,
) -> ValidationIssue:
    return ValidationIssue(
        issue_id=issue_id,
        severity=Severity.INFO,
        type=IssueType.POLICY_NOTE,
        description=f"[{rule_id} — {rule_type}] {rule_text}",
        proposed_fix="No action required — informational note for compliance.",
    )
