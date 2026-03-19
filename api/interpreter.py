"""Stage 1: LLM interpretation — enrich form input with Azure OpenAI."""

from __future__ import annotations

import json
import os
from typing import Any

from api.azure_client import get_azure_client
from api.models import CategoryAlternative, CategorySuggestion, EnrichedRequest, FormInput, TextContradiction


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
   - unit_of_measure_required: boolean. Set to true ONLY when the items being requested are measured in a non-obvious unit that the user must specify (e.g. weight: kg/tons, volume: liters, time: hours/days, length: meters). Set to false when items are countable and the unit is obvious (e.g. laptops, lightbulbs, chairs, licenses — these are just "units"/"devices"/"pieces" and don't need explicit specification).

3. CRITICAL: Only detect contradictions when there is a clear, unambiguous conflict. Do NOT flag minor wording differences.
4. Always reason internally in English regardless of input language.
5. delivery_country_code: Extract the ISO 3166-1 alpha-2 country code from the delivery_address field. Use the address, city, or country name to determine the correct code (e.g. "Zurich, Switzerland" → "CH", "Berlin" → "DE", "123 Main St, New York" → "US"). Return null if you cannot determine the country.

6. AUTO-CATEGORIZATION (CRITICAL):
   You MUST determine the correct category_l1 and category_l2 from the CATEGORY TAXONOMY above based on the request_text.
   - If the user already provided category_l1/category_l2 in the form, validate them against the text. If they match, use them. If they conflict, prefer what the text describes.
   - If no category was provided by the user, infer it from the text.
   - Set category_confidence (0.0 to 1.0):
     * 0.9-1.0: Very clear match (e.g. "50 Dell laptops" → IT > Laptops)
     * 0.7-0.89: Likely match but some ambiguity (e.g. "computers for engineering" → IT > Laptops or IT > Mobile Workstations?)
     * 0.5-0.69: Ambiguous, multiple categories plausible
     * Below 0.5: Cannot determine category
   - category_reasoning: brief explanation of why this category was chosen
   - category_alternatives: if confidence < 0.9, provide up to 3 alternative categories with reasons. Each has: alt_category_l1, alt_category_l2, alt_reason.

7. Return ONLY valid JSON matching the schema below. No markdown, no explanation."""


_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "enriched_request",
        "description": "The enriched procurement request with fields extracted from the free text.",
        "parameters": {
            "type": "object",
            "properties": {
                "item_description": {"type": "string"},
                "delivery_country_code": {"type": ["string", "null"], "description": "ISO 3166-1 alpha-2 country code extracted from delivery_address"},
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
                "unit_of_measure_required": {"type": "boolean", "description": "Whether the user must specify a unit of measure (true for bulk/weight/volume items like flour, cable; false for countable items like laptops, chairs)"},
                "category_l1": {"type": "string", "description": "Auto-detected category L1 from the taxonomy"},
                "category_l2": {"type": "string", "description": "Auto-detected category L2 from the taxonomy"},
                "category_confidence": {"type": "number", "description": "Confidence score 0.0-1.0 for the category assignment"},
                "category_reasoning": {"type": "string", "description": "Brief explanation of why this category was chosen"},
                "category_alternatives": {
                    "type": "array",
                    "description": "Alternative categories if confidence < 0.9",
                    "items": {
                        "type": "object",
                        "properties": {
                            "alt_category_l1": {"type": "string"},
                            "alt_category_l2": {"type": "string"},
                            "alt_reason": {"type": "string"},
                        },
                        "required": ["alt_category_l1", "alt_category_l2", "alt_reason"],
                    },
                },
            },
            "required": [
                "item_description",
                "delivery_country_code",
                "preferred_supplier_id",
                "preferred_supplier_name",
                "data_residency_required",
                "esg_requirement",
                "urgency",
                "additional_specs",
                "detected_language",
                "text_quantity_mentioned",
                "text_contradictions",
                "unit_of_measure_required",
                "category_l1",
                "category_l2",
                "category_confidence",
                "category_reasoning",
                "category_alternatives",
            ],
        },
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
- delivery_address: {form.delivery_address or 'NOT PROVIDED'}
- required_by_date: {form.required_by_date or 'NOT PROVIDED'}
- preferred_supplier: {form.preferred_supplier or 'NOT PROVIDED'}

Extract and enrich the request using the enriched_request function."""


async def interpret_request(
    form_input: FormInput,
    categories: list[dict],
    suppliers: list[dict],
) -> EnrichedRequest:
    """Call Azure OpenAI to enrich form input with text-extracted fields."""
    client = get_azure_client()
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

    response = await client.chat.completions.create(
        model=deployment,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": _build_system_prompt(categories, suppliers)},
            {"role": "user", "content": _build_user_message(form_input)},
        ],
        tools=[_TOOL_SCHEMA],
        tool_choice={"type": "function", "function": {"name": "enriched_request"}},
    )

    # Extract tool call result
    message = response.choices[0].message
    if not message.tool_calls:
        raise RuntimeError("LLM did not return a tool call for request interpretation")

    try:
        tool_result: dict[str, Any] = json.loads(message.tool_calls[0].function.arguments)
    except (json.JSONDecodeError, IndexError, AttributeError) as exc:
        raise RuntimeError("LLM returned an unparseable response for interpretation") from exc

    contradictions: list[TextContradiction] = []
    for c in tool_result.get("text_contradictions", []):
        try:
            contradictions.append(TextContradiction(**c))
        except (TypeError, ValueError):
            continue  # skip malformed contradiction entries

    # Derive delivery_country from LLM extraction of address
    delivery_country = tool_result.get("delivery_country_code") or None

    # Build category suggestion from LLM output
    llm_cat_l1 = tool_result.get("category_l1", "")
    llm_cat_l2 = tool_result.get("category_l2", "")
    llm_confidence = tool_result.get("category_confidence", 0.0)

    alternatives: list[CategoryAlternative] = []
    for alt in tool_result.get("category_alternatives", []):
        try:
            alternatives.append(CategoryAlternative(
                category_l1=alt["alt_category_l1"],
                category_l2=alt["alt_category_l2"],
                reason=alt["alt_reason"],
            ))
        except (TypeError, ValueError, KeyError):
            continue

    category_suggestion = CategorySuggestion(
        category_l1=llm_cat_l1,
        category_l2=llm_cat_l2,
        confidence=max(0.0, min(1.0, llm_confidence)),
        reasoning=tool_result.get("category_reasoning", ""),
        alternatives=alternatives,
        needs_disambiguation=llm_confidence < 0.85,
    )

    # Use LLM-assigned category if user didn't provide one, or if LLM overrides
    effective_l1 = form_input.category_l1 or llm_cat_l1
    effective_l2 = form_input.category_l2 or llm_cat_l2

    return EnrichedRequest(
        # Carry through form fields (with auto-categorization)
        request_text=form_input.request_text,
        quantity=form_input.quantity,
        unit_of_measure=form_input.unit_of_measure,
        category_l1=effective_l1,
        category_l2=effective_l2,
        delivery_country=delivery_country,
        delivery_address=form_input.delivery_address,
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
        detected_language=form_input.language,
        text_quantity_mentioned=tool_result.get("text_quantity_mentioned"),
        text_contradictions=contradictions,
        unit_of_measure_required=tool_result.get("unit_of_measure_required", False),
        category_suggestion=category_suggestion,
    )
