"""Stage 1: LLM interpretation — enrich form input with Claude API."""

from __future__ import annotations

import json
import os
from typing import Any

from anthropic import AsyncAnthropic

from api.models import EnrichedRequest, FormInput, TextContradiction

_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
    return _client


def _build_system_prompt(categories: list[dict], suppliers: list[dict]) -> str:
    cat_lines = "\n".join(
        f"- {c['category_l1']} > {c['category_l2']} (unit: {c['typical_unit']})"
        for c in categories
    )

    # Deduplicate supplier names
    seen: set[str] = set()
    sup_lines_list: list[str] = []
    for s in suppliers:
        key = s["supplier_id"]
        if key not in seen:
            seen.add(key)
            sup_lines_list.append(f"- {s['supplier_id']}: {s['supplier_name']}")
    sup_lines = "\n".join(sup_lines_list)

    return f"""You are a procurement request interpreter. Your job is to analyze a purchase request form and enrich it with information extracted from the free-text description.

CATEGORY TAXONOMY (only valid values):
{cat_lines}

KNOWN SUPPLIERS:
{sup_lines}

INSTRUCTIONS:
1. Read the request_text carefully (it may be in any language: en, fr, de, es, pt, ja).
2. Extract/enrich these fields from the text:
   - item_description: a clean, concise English description of what is being requested
   - preferred_supplier_id: if a supplier is mentioned in the text, resolve it to one of the KNOWN SUPPLIERS IDs above. Use fuzzy matching (e.g. "Dell" -> "SUP-0001"). Return null if no match.
   - preferred_supplier_name: the full official name from the list above
   - data_residency_required: true if the text mentions data sovereignty, residency, GDPR, local hosting, etc.
   - esg_requirement: true if ESG, sustainability, green, carbon neutral, etc. are mentioned
   - urgency: "critical" if ASAP/urgent/emergency, "high" if tight deadline mentioned, "normal" otherwise
   - additional_specs: any technical specifications, compatibility requirements, or special instructions from the text
   - detected_language: ISO 639-1 code of the request_text language
   - text_quantity_mentioned: if the text explicitly mentions a quantity/number, extract it as an integer. null if no quantity in text.
   - text_contradictions: array of contradictions between the structured form fields and the text. Each item has: field, form_value, text_value, explanation.

3. CRITICAL: Only detect contradictions when there is a clear, unambiguous conflict. Do NOT flag minor wording differences.
4. Always reason internally in English regardless of input language.
5. Return ONLY valid JSON matching the schema below. No markdown, no explanation."""


_TOOL_SCHEMA = {
    "name": "enriched_request",
    "description": "The enriched procurement request with fields extracted from the free text.",
    "input_schema": {
        "type": "object",
        "properties": {
            "item_description": {"type": "string"},
            "preferred_supplier_id": {"type": ["string", "null"]},
            "preferred_supplier_name": {"type": ["string", "null"]},
            "data_residency_required": {"type": "boolean"},
            "esg_requirement": {"type": "boolean"},
            "urgency": {"type": "string", "enum": ["normal", "high", "critical"]},
            "additional_specs": {"type": "string"},
            "detected_language": {"type": "string"},
            "text_quantity_mentioned": {"type": ["integer", "null"]},
            "text_contradictions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string"},
                        "form_value": {"type": "string"},
                        "text_value": {"type": "string"},
                        "explanation": {"type": "string"},
                    },
                    "required": ["field", "form_value", "text_value", "explanation"],
                },
            },
        },
        "required": [
            "item_description",
            "preferred_supplier_id",
            "preferred_supplier_name",
            "data_residency_required",
            "esg_requirement",
            "urgency",
            "additional_specs",
            "detected_language",
            "text_quantity_mentioned",
            "text_contradictions",
        ],
    },
}


def _build_user_message(form: FormInput) -> str:
    return f"""Analyze this procurement request:

REQUEST TEXT:
{form.request_text}

STRUCTURED FORM FIELDS:
- category_l1: {form.category_l1 or 'NOT PROVIDED'}
- category_l2: {form.category_l2 or 'NOT PROVIDED'}
- quantity: {form.quantity or 'NOT PROVIDED'}
- unit_of_measure: {form.unit_of_measure or 'NOT PROVIDED'}
- delivery_country: {form.delivery_country or 'NOT PROVIDED'}
- required_by_date: {form.required_by_date or 'NOT PROVIDED'}
- preferred_supplier: {form.preferred_supplier or 'NOT PROVIDED'}

Extract and enrich the request using the enriched_request tool."""


async def interpret_request(
    form_input: FormInput,
    categories: list[dict],
    suppliers: list[dict],
) -> EnrichedRequest:
    """Call Claude to enrich form input with text-extracted fields."""
    client = _get_client()

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=_build_system_prompt(categories, suppliers),
        tools=[_TOOL_SCHEMA],
        tool_choice={"type": "tool", "name": "enriched_request"},
        messages=[{"role": "user", "content": _build_user_message(form_input)}],
    )

    # Extract tool use result
    tool_result: dict[str, Any] = {}
    for block in response.content:
        if block.type == "tool_use":
            tool_result = block.input
            break

    contradictions = [
        TextContradiction(**c) for c in tool_result.get("text_contradictions", [])
    ]

    return EnrichedRequest(
        # Carry through form fields
        request_text=form_input.request_text,
        quantity=form_input.quantity,
        unit_of_measure=form_input.unit_of_measure,
        category_l1=form_input.category_l1,
        category_l2=form_input.category_l2,
        delivery_country=form_input.delivery_country,
        required_by_date=form_input.required_by_date,
        preferred_supplier=form_input.preferred_supplier,
        # LLM-enriched fields
        item_description=tool_result.get("item_description", ""),
        preferred_supplier_id=tool_result.get("preferred_supplier_id"),
        preferred_supplier_name=tool_result.get("preferred_supplier_name"),
        data_residency_required=tool_result.get("data_residency_required", False),
        esg_requirement=tool_result.get("esg_requirement", False),
        urgency=tool_result.get("urgency", "normal"),
        additional_specs=tool_result.get("additional_specs", ""),
        detected_language=tool_result.get("detected_language", "en"),
        text_quantity_mentioned=tool_result.get("text_quantity_mentioned"),
        text_contradictions=contradictions,
    )
