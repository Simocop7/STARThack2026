# ChainIQ START Hack 2026 — Audit-Ready Autonomous Sourcing Agent

## Challenge Overview

Build a **working prototype** that converts **unstructured purchase requests** into **structured, defensible supplier comparisons** with transparent reasoning and escalation logic.

The system must interpret free-text procurement requests (including non-English), apply governance rules, compare suppliers, and produce audit-ready outputs. Focus is on **reasoning architecture, rule enforcement, and explainability** — not just generating answers.

## Users

- Procurement managers, category buyers, compliance/risk reviewers, business stakeholders

## Judging Criteria

| Criteria | Weight |
|----------|--------|
| Creativity | 20% |
| Visual Design | 10% |
| Feasibility | 25% |
| Reachability | 20% |
| Robustness & Escalation Logic | 25% |

## Presentation: 5 min live demo + 3 min explanation

Show: 1 standard request, 1 edge case, supplier comparison view, rule application, escalation handling.

---

## Datasets (in `ChainIQ-START-Hack-2026-/data/`)

| File | Records | Description |
|------|---------|-------------|
| `requests.json` | 304 | Unstructured purchase requests (messy, multilingual, contradictory) |
| `suppliers.csv` | 151 rows / 40 suppliers | Supplier master data: capabilities, risk, restrictions, regions |
| `pricing.csv` | 599 | Pricing tiers by volume, region, delivery speed |
| `categories.csv` | 30 | Category taxonomy (4 L1: IT, Facilities, Professional Services, Marketing) |
| `policies.json` | 6 sections | Approval thresholds, preferred/restricted suppliers, category rules, geography rules, escalation rules |
| `historical_awards.csv` | 590 | Past sourcing decisions (180 of 304 requests have awards) |

## Geographic Coverage

| Region | Countries | Currency |
|--------|-----------|----------|
| Western Europe | DE, FR, NL, BE, AT, IT, ES, PL, UK | EUR |
| Switzerland | CH | CHF |
| Americas | US, CA, BR, MX | USD |
| APAC | SG, AU, IN, JP | USD |
| MEA | UAE, ZA | USD |

---

## Pipeline: What the System Must Do

1. **Interpret** — Parse free-text request, handle non-English (fr, de, es, pt, ja)
2. **Extract** — Category, quantity, budget, delivery constraints, preferred supplier
3. **Validate** — Completeness check + internal consistency (quantity vs text, budget vs pricing)
4. **Apply policies** — Approval thresholds, preferred/restricted suppliers, category rules, geography rules
5. **Identify suppliers** — Filter by category, delivery country, currency, restrictions
6. **Rank suppliers** — Score on pricing (correct tier), quality, risk, ESG
7. **Explain** — Auditable reasoning for every inclusion/exclusion
8. **Escalate** — When policy requires human involvement, name the rule and target

---

## Policy Rules Summary

### Approval Thresholds (policies.json → approval_thresholds)

5 tiers per currency (EUR, CHF, USD). Key EUR thresholds:
- **< 25K**: 1 quote, business approval
- **25K–100K**: 2 quotes, business + procurement, deviation → Procurement Manager
- **100K–500K**: 3 quotes, Head of Category
- **500K–5M**: 3 quotes, Head of Strategic Sourcing
- **> 5M**: 3 quotes, CPO

USD thresholds: <27K / 27K–108K / 108K–540K / 540K–5.4M / >5.4M

**Important**: Threshold is determined by *actual contract value* (quantity × unit_price), not stated budget.

### Restricted Suppliers (policies.json → restricted_suppliers)

- **SUP-0008 Computacenter**: Restricted for Laptops in CH+DE; Mobile Workstations in CH
- **SUP-0011 AWS EMEA**: Restricted for Cloud Storage in CH (data sovereignty)
- **SUP-0045 Boutique Creator Network**: Requires exception approval above EUR 75K (global)
- **SUP-0017 Alibaba Cloud**: Restricted in US, CA, AU, IN for Cloud Storage (data sovereignty)

**Critical**: `is_restricted` flag in suppliers.csv is a hint only. Always cross-reference policies.json.

### Category Rules (policies.json → category_rules)

- **CR-001**: IT/Laptops > 100K EUR/CHF → mandatory 3-supplier comparison
- **CR-002**: Mobile Workstations > 50 units → engineering/CAD review
- **CR-003**: Break-Fix < 75K → fast-track (1 quote OK)
- **CR-004**: Cloud Compute + data_residency → only residency-compliant suppliers
- **CR-005**: Managed Cloud > 250K → security architecture review
- **CR-006**: Reception/Lounge furniture → design sign-off required
- **CR-007**: Software Dev > 60 consulting days → CV review required
- **CR-008**: Cybersecurity Advisory → certification check
- **CR-009**: SEM → performance baseline required
- **CR-010**: Influencer campaigns → brand safety review

### Geography Rules (policies.json → geography_rules)

- **GR-001 CH**: Swiss data residency → sovereign/approved providers
- **GR-002 DE**: Urgent devices → must meet delivery deadline
- **GR-003 FR**: French-language delivery support
- **GR-004 ES**: Large rollouts → installation/deployment support evidence
- **GR-005 Americas**: US data sovereignty for financial/healthcare
- **GR-006 APAC**: India RBI, Singapore MAS, Japan FISC for financial data
- **GR-007 MEA**: UAE PDPL, South Africa POPIA compliance
- **GR-008 LATAM**: Brazil LGPD, Mexico LFPDPPP, DPA required

### Escalation Rules (policies.json → escalation_rules)

| Rule | Trigger | Escalate To |
|------|---------|-------------|
| ER-001 | Missing info (budget, quantity, spec) | Requester |
| ER-002 | Preferred supplier is restricted | Procurement Manager |
| ER-003 | Value exceeds threshold | Head of Strategic Sourcing |
| ER-004 | No compliant supplier found | Head of Category |
| ER-005 | Data residency unsatisfiable | Security/Compliance |
| ER-006 | Quantity exceeds supplier capacity | Sourcing Excellence Lead |
| ER-007 | Brand safety concern (Marketing) | Marketing Governance Lead |
| ER-008 | Supplier not registered in delivery country | Regional Compliance Lead |

---

## Scenario Tags in Requests

| Tag | Count | What to handle |
|-----|-------|----------------|
| `standard` | 141 | Well-formed, no conflicts |
| `threshold` | 29 | Budget near approval tier boundary |
| `lead_time` | 29 | Critically short delivery deadline |
| `missing_info` | 28 | Null budget or quantity → escalate ER-001 |
| `contradictory` | 21 | Quantity/text mismatch, budget insufficient, policy refusal |
| `restricted` | 18 | Preferred supplier restricted/wrong category/wrong region |
| `multilingual` | 18 | Non-English text or multi-country regulatory |
| `capacity` | 18 | Quantity exceeds supplier monthly capacity |
| `multi_country` | 3 | Multiple delivery countries, different compliance rules |

---

## Expected Output Format (per request)

Based on `examples/example_output.json` for REQ-000004:

```
{
  "request_id": "REQ-XXXXXX",
  "processed_at": "<ISO timestamp>",

  "request_interpretation": {
    "category_l1", "category_l2", "quantity", "unit_of_measure",
    "budget_amount", "currency", "delivery_country", "required_by_date",
    "days_until_required", "data_residency_required", "esg_requirement",
    "preferred_supplier_stated", "incumbent_supplier",
    "requester_instruction"  // extracted from free text
  },

  "validation": {
    "completeness": "pass|fail",
    "issues_detected": [
      {
        "issue_id", "severity" (critical/high/medium/low),
        "type" (budget_insufficient, policy_conflict, lead_time_infeasible, missing_info, ...),
        "description",  // detailed, quantified
        "action_required"  // what must happen to resolve
      }
    ]
  },

  "policy_evaluation": {
    "approval_threshold": {
      "rule_applied", "basis", "quotes_required", "approvers",
      "deviation_approval", "note"
    },
    "preferred_supplier": {
      "supplier", "status", "is_preferred", "covers_delivery_country",
      "is_restricted", "policy_note"
    },
    "restricted_suppliers": { ... },
    "category_rules_applied": [...],
    "geography_rules_applied": [...]
  },

  "supplier_shortlist": [
    {
      "rank", "supplier_id", "supplier_name",
      "preferred", "incumbent",
      "pricing_tier_applied", "unit_price", "total_price",
      "standard_lead_time_days", "expedited_lead_time_days",
      "expedited_unit_price", "expedited_total",
      "quality_score", "risk_score", "esg_score",
      "policy_compliant", "covers_delivery_country",
      "recommendation_note"  // auditable reasoning
    }
  ],

  "suppliers_excluded": [
    { "supplier_id", "supplier_name", "reason" }
  ],

  "escalations": [
    {
      "escalation_id", "rule", "trigger",
      "escalate_to", "blocking": true|false
    }
  ],

  "recommendation": {
    "status": "can_proceed|cannot_proceed",
    "reason",
    "preferred_supplier_if_resolved",
    "preferred_supplier_rationale",
    "minimum_budget_required", "minimum_budget_currency"
  },

  "audit_trail": {
    "policies_checked": [...],
    "supplier_ids_evaluated": [...],
    "pricing_tiers_applied",
    "data_sources_used": [...],
    "historical_awards_consulted": true|false,
    "historical_award_note"
  }
}
```

---

## Key Data Gotchas

- **Preferred supplier category mismatch**: Some requests name a supplier from a different category → discard preference
- **Preferred supplier geographic mismatch**: Supplier doesn't cover delivery country
- **Conditional restrictions**: Some only apply above a value threshold or in specific countries
- **Quantity/text discrepancy**: `quantity` field may conflict with `request_text` → surface both
- **Budget vs actual cost**: Stated budget may be insufficient → compute actual cost from pricing tiers
- **Pricing tier selection**: Match `quantity` against `min_quantity`/`max_quantity` in pricing.csv. Hardware has 4 tiers: 1–99, 100–499, 500–1999, 2000+
- **Lead times**: standard_lead_time_days vs expedited (with ~8% price premium)
- **Historical awards**: Contextual precedent only, not ground truth. 124 requests have no awards.
- **Award dates ≠ delivery dates**: award_date is decision date, not delivery

## Supplier Filtering Logic

For each request, filter suppliers by:
1. **Category match**: supplier's category_l1 + category_l2 must match request
2. **Geographic coverage**: delivery_countries must be in supplier's service_regions
3. **Not restricted**: Check policies.json restricted_suppliers for category + country + value
4. **Currency**: Match or note currency mismatch
5. **Data residency**: If required, supplier must support it (data_residency_supported field)
6. **Capacity**: Check quantity vs capacity_per_month

## Tech Stack

- Azure credits available
- Any language, UI framework, AI tooling, and/or rules engine allowed
