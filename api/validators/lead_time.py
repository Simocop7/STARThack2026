"""Check if delivery date is feasible given supplier lead times."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from api.models import EnrichedRequest, FixAction, IssueType, Severity, ValidationIssue
from api.region_mapper import country_to_region


def check_lead_time(
    enriched: EnrichedRequest,
    pricing_index: dict[tuple[str, str, str, str], list[dict]],
    suppliers_by_category: dict[tuple[str, str], list[dict]],
    today: date | None = None,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    if not enriched.required_by_date or not enriched.category_l1 or not enriched.category_l2:
        return issues

    if today is None:
        today = date.today()

    days_until = (enriched.required_by_date - today).days
    if days_until < 0:
        issues.append(
            ValidationIssue(
                issue_id="LT-001",
                severity=Severity.CRITICAL,
                type=IssueType.LEAD_TIME_WARNING,
                description=f"Required-by date {enriched.required_by_date} is in the past.",
                proposed_fix="Update the required-by date to a future date.",
                fix_action=FixAction(
                    field="required_by_date",
                    suggested_value=str(today + timedelta(days=30)),
                ),
            )
        )
        return issues

    region = country_to_region(enriched.delivery_country) if enriched.delivery_country else None
    if not region:
        return issues

    cat_suppliers = suppliers_by_category.get(
        (enriched.category_l1, enriched.category_l2), []
    )
    if not cat_suppliers:
        return issues

    best_standard: int | None = None
    best_expedited: int | None = None
    best_expedited_supplier: str = ""

    for sup in cat_suppliers:
        if enriched.delivery_country and enriched.delivery_country not in sup["service_regions"]:
            continue

        tiers = pricing_index.get(
            (sup["supplier_id"], enriched.category_l1, enriched.category_l2, region),
            [],
        )
        for tier in tiers:
            std = tier["standard_lead_time_days"]
            exp = tier["expedited_lead_time_days"]
            if best_standard is None or std < best_standard:
                best_standard = std
            if best_expedited is None or exp < best_expedited:
                best_expedited = exp
                best_expedited_supplier = sup["supplier_name"]

    if best_expedited is not None and days_until < best_expedited:
        earliest = today + timedelta(days=best_expedited)
        issues.append(
            ValidationIssue(
                issue_id="LT-001",
                severity=Severity.HIGH,
                type=IssueType.LEAD_TIME_WARNING,
                description=(
                    f"Required delivery in {days_until} days, but the fastest "
                    f"option (expedited via {best_expedited_supplier}) needs "
                    f"{best_expedited} days."
                ),
                proposed_fix=(
                    f"Earliest feasible date: {earliest} "
                    f"(expedited shipping with {best_expedited_supplier})."
                ),
                fix_action=FixAction(
                    field="required_by_date",
                    suggested_value=str(earliest),
                ),
            )
        )
    elif best_standard is not None and days_until < best_standard:
        earliest_std = today + timedelta(days=best_standard)
        issues.append(
            ValidationIssue(
                issue_id="LT-001",
                severity=Severity.MEDIUM,
                type=IssueType.LEAD_TIME_WARNING,
                description=(
                    f"Standard delivery needs {best_standard} days but only "
                    f"{days_until} days available. Expedited shipping "
                    f"({best_expedited} days) may be needed."
                ),
                proposed_fix=(
                    f"Consider expedited shipping, or extend deadline to "
                    f"{earliest_std}."
                ),
                fix_action=FixAction(
                    field="required_by_date",
                    suggested_value=str(earliest_std),
                ),
            )
        )

    return issues
