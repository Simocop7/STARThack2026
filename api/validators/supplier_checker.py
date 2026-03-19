"""Validate preferred supplier against category, geography, restrictions, and capacity."""

from __future__ import annotations

from typing import Any

from api.models import EnrichedRequest, FixAction, IssueType, Severity, ValidationIssue


def check_supplier(
    enriched: EnrichedRequest,
    suppliers_by_category: dict[tuple[str, str], list[dict]],
    supplier_by_key: dict[tuple[str, str, str], dict],
    policies: dict[str, Any],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    counter = 0

    sup_id = enriched.preferred_supplier_id
    sup_name = enriched.preferred_supplier_name or enriched.preferred_supplier
    cat_l1 = enriched.category_l1
    cat_l2 = enriched.category_l2
    country = enriched.delivery_country

    if not sup_id or not cat_l1 or not cat_l2:
        return issues

    # --- Category match ---
    key = (sup_id, cat_l1, cat_l2)
    supplier_row = supplier_by_key.get(key)

    if supplier_row is None:
        counter += 1
        available = suppliers_by_category.get((cat_l1, cat_l2), [])
        alt_names = [s["supplier_name"] for s in available[:5]]
        issues.append(
            ValidationIssue(
                issue_id=f"SUP-{counter:03d}",
                severity=Severity.HIGH,
                type=IssueType.CATEGORY_MISMATCH,
                description=(
                    f"Supplier '{sup_name}' ({sup_id}) does not operate in "
                    f"category {cat_l1} > {cat_l2}."
                ),
                proposed_fix=(
                    f"Consider one of these suppliers for {cat_l1} > {cat_l2}: "
                    f"{', '.join(alt_names)}."
                    if alt_names
                    else f"No suppliers found for {cat_l1} > {cat_l2}."
                ),
                fix_action=FixAction(
                    field="preferred_supplier",
                    suggested_value=alt_names[0] if alt_names else None,
                    alternatives=alt_names[1:] if len(alt_names) > 1 else [],
                ),
            )
        )
        return issues  # no point checking geography/restriction if category doesn't match

    # --- Geography match ---
    if country and country not in supplier_row["service_regions"]:
        counter += 1
        covered = suppliers_by_category.get((cat_l1, cat_l2), [])
        alt_for_country = [
            s["supplier_name"]
            for s in covered
            if country in s["service_regions"]
        ][:5]
        issues.append(
            ValidationIssue(
                issue_id=f"SUP-{counter:03d}",
                severity=Severity.HIGH,
                type=IssueType.GEOGRAPHY_MISMATCH,
                description=(
                    f"Supplier '{sup_name}' does not cover delivery country "
                    f"'{country}'. They serve: {', '.join(supplier_row['service_regions'])}."
                ),
                proposed_fix=(
                    f"Suppliers covering {country} for {cat_l2}: "
                    f"{', '.join(alt_for_country)}."
                    if alt_for_country
                    else f"No suppliers cover {country} for {cat_l2}."
                ),
                fix_action=FixAction(
                    field="preferred_supplier",
                    suggested_value=alt_for_country[0] if alt_for_country else None,
                    alternatives=alt_for_country[1:] if len(alt_for_country) > 1 else [],
                ),
            )
        )

    # --- Restriction check ---
    for restriction in policies.get("restricted_suppliers", []):
        if restriction["supplier_id"] != sup_id:
            continue
        if restriction["category_l2"] != cat_l2:
            continue

        scope = restriction.get("restriction_scope", [])
        # "all" means global restriction
        applies = "all" in scope or (country and country in scope)
        if not applies:
            continue

        counter += 1
        reason = restriction.get("restriction_reason", "Policy restriction")

        available = suppliers_by_category.get((cat_l1, cat_l2), [])
        alt_names = [
            s["supplier_name"]
            for s in available
            if s["supplier_id"] != sup_id and (not country or country in s["service_regions"])
        ][:5]

        issues.append(
            ValidationIssue(
                issue_id=f"SUP-{counter:03d}",
                severity=Severity.HIGH,
                type=IssueType.RESTRICTED_SUPPLIER,
                description=(
                    f"Supplier '{sup_name}' is RESTRICTED for {cat_l2} "
                    f"in {country or 'this scope'}. Reason: {reason}"
                ),
                proposed_fix=(
                    f"Alternative suppliers: {', '.join(alt_names)}."
                    if alt_names
                    else "No alternative suppliers available."
                ),
                fix_action=FixAction(
                    field="preferred_supplier",
                    suggested_value=alt_names[0] if alt_names else None,
                    alternatives=alt_names[1:] if len(alt_names) > 1 else [],
                ),
            )
        )

    # --- Capacity check ---
    if (
        supplier_row
        and enriched.quantity
        and enriched.quantity > supplier_row["capacity_per_month"]
    ):
        counter += 1
        cap = supplier_row["capacity_per_month"]
        issues.append(
            ValidationIssue(
                issue_id=f"SUP-{counter:03d}",
                severity=Severity.MEDIUM,
                type=IssueType.CAPACITY_EXCEEDED,
                description=(
                    f"Requested quantity ({enriched.quantity}) exceeds "
                    f"'{sup_name}' monthly capacity ({cap})."
                ),
                proposed_fix=(
                    f"Reduce quantity to {cap} or split the order across "
                    f"multiple suppliers/months."
                ),
                fix_action=FixAction(
                    field="quantity",
                    suggested_value=str(cap),
                ),
            )
        )

    return issues
