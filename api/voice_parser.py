"""Parse voice transcripts into structured procurement form fields using Azure OpenAI."""

from __future__ import annotations

import json
import os
from datetime import date, timedelta
from typing import Any

from api.azure_client import get_azure_client

_VALID_COUNTRY_CODES = {
    "DE", "FR", "NL", "BE", "AT", "IT", "ES", "PL", "UK",
    "CH", "US", "CA", "BR", "MX", "SG", "AU", "IN", "JP", "UAE", "ZA",
}

_VOICE_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "parsed_voice_fields",
        "description": "Structured form fields extracted from a voice transcript of a procurement request.",
        "parameters": {
            "type": "object",
            "properties": {
                "request_text": {
                    "type": "string",
                    "description": "A concise procurement request description extracted from the voice transcript. Strip conversational/command language (e.g. 'please order', 'per favore ordina', 'I need you to buy') and keep only the item, quantity, and constraints.",
                },
                "quantity": {
                    "type": ["integer", "null"],
                    "description": "Number of items requested, extracted from the transcript.",
                },
                "unit_of_measure": {
                    "type": ["string", "null"],
                    "description": "Unit of measure (e.g. 'device', 'unit', 'consulting_day').",
                },
                "required_by_date": {
                    "type": ["string", "null"],
                    "description": "ISO date string (YYYY-MM-DD) if a deadline is mentioned.",
                },
                "preferred_supplier": {
                    "type": ["string", "null"],
                    "description": "Supplier name if mentioned in the transcript.",
                },
                "delivery_country": {
                    "type": ["string", "null"],
                    "description": "ISO country code for delivery (e.g. DE, CH, US, FR). If user says a city name, map to country code. If user says a country name, convert to code. Valid codes: DE, FR, NL, BE, AT, IT, ES, PL, UK, CH, US, CA, BR, MX, SG, AU, IN, JP, UAE, ZA. Null if not mentioned.",
                },
                "budget_amount": {
                    "type": ["number", "null"],
                    "description": "Budget amount as a number (e.g. 5000 for '5000 euros', 10000 for '10k', 2500 for '2.5K'). Extract only the numeric value; ignore currency symbol. Null if not mentioned.",
                },
                "currency": {
                    "type": ["string", "null"],
                    "description": "Currency code if mentioned (EUR, CHF, USD, GBP). Null if not mentioned.",
                },
                "missing_fields": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of important fields that could not be extracted and should be filled manually.",
                },
            },
            "required": [
                "request_text",
                "quantity",
                "unit_of_measure",
                "required_by_date",
                "preferred_supplier",
                "delivery_country",
                "budget_amount",
                "currency",
                "missing_fields",
            ],
        },
    },
}


async def parse_voice_transcript(
    transcript: str,
    language: str,
    today: str,
) -> dict[str, Any]:
    """Use LLM to extract structured form fields from a voice transcript.

    Args:
        transcript: The raw speech-to-text output.
        language: UI language code (e.g. "en", "de", "fr").
        today: Today's date as ISO string for relative date resolution.
    """
    client = get_azure_client()
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

    system_prompt = f"""You are a procurement assistant that extracts structured form fields from voice transcripts.

The user has spoken a procurement request using voice input. The transcript may contain:
- Speech recognition errors (e.g. "lampadaijne" instead of "lampadine", "filips" instead of "Philips")
- Informal language, colloquialisms
- Multiple languages (the user's UI language is: {language})
- Relative dates like "domani" (tomorrow), "la prossima settimana" (next week), "entro venerdì" (by Friday)

Today's date is: {today}

Your job:
1. Clean up the transcript into a concise procurement request description: correct obvious speech-to-text errors AND strip away conversational/command language (e.g. "per favore ordina", "please order", "I would like to buy", "bitte bestelle") — keep only the actual item description, quantity, and constraints
2. Extract quantity, unit of measure, deadline, and preferred supplier
3. If the user mentions a delivery country, city, or location, extract the ISO country code as delivery_country. Map city names to country codes (e.g. "Berlin" → "DE", "Zurich" → "CH", "Tokyo" → "JP", "New York" → "US"). Valid codes: DE, FR, NL, BE, AT, IT, ES, PL, UK, CH, US, CA, BR, MX, SG, AU, IN, JP, UAE, ZA
4. Convert relative dates to absolute ISO dates (YYYY-MM-DD) based on today's date
5. List any important fields that are missing and should be filled manually by the user

IMPORTANT:
- Fix obvious speech recognition errors (e.g. "lampadaijne" → "lampadine", "filips" → "Philips")
- The request_text should be a concise procurement description (e.g. "per favore ordina due penne" → "2 penne", "please order 50 laptops for the Berlin office" → "50 laptops for Berlin office"). Remove pleasantries, commands, and filler words.
- If the user mentions a brand/supplier, extract it as preferred_supplier
- If the user mentions a delivery location (country, city, or region), convert it to an ISO country code and set delivery_country. If not mentioned, set to null.
- For countable items (e.g. laptops, lightbulbs, chairs, licenses), the unit_of_measure is obvious ("unit", "device", etc.) — you can auto-fill it or leave it null; do NOT add it to missing_fields.
- For items measured by weight, volume, length, or time (e.g. flour, cable, consulting hours), unit_of_measure is critical. If the user did not specify it, set unit_of_measure to null and ADD "unit_of_measure" to missing_fields.
- If quantity is not mentioned, set it to null
- If the user mentions a budget (e.g. "budget of 5000 euros", "ten thousand", "within 2.5K CHF"), extract budget_amount as a number and currency as the 3-letter code (EUR, CHF, USD, GBP). Handle shorthand: "10K" → 10000, "2.5K" → 2500, "1M" → 1000000. If not mentioned, set both to null.
- missing_fields should only include: "quantity", "required_by_date", "unit_of_measure" (when applicable), "budget" (if not mentioned). Do NOT add "budget" if the user already stated a budget amount."""

    response = await client.chat.completions.create(
        model=deployment,
        max_tokens=512,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f'Voice transcript: "{transcript}"'},
        ],
        tools=[_VOICE_TOOL_SCHEMA],
        tool_choice={"type": "function", "function": {"name": "parsed_voice_fields"}},  # type: ignore[call-overload]
    )

    message = response.choices[0].message
    if not message.tool_calls:
        raise RuntimeError("LLM did not return a tool call for voice parsing")

    try:
        result: dict[str, Any] = json.loads(message.tool_calls[0].function.arguments)
    except (json.JSONDecodeError, IndexError, AttributeError) as exc:
        raise RuntimeError("LLM returned unparseable response for voice parsing") from exc

    # ── Post-LLM validation: sanitize output before returning ──
    missing = result.get("missing_fields", [])

    # Validate delivery_country
    dc = result.get("delivery_country")
    if dc and str(dc).upper().strip() not in _VALID_COUNTRY_CODES:
        result["delivery_country"] = None

    # Validate quantity is a positive integer
    qty = result.get("quantity")
    if qty is not None:
        try:
            qty = int(qty)
            if qty < 1:
                result["quantity"] = None
                if "quantity" not in missing:
                    missing.append("quantity")
        except (ValueError, TypeError):
            result["quantity"] = None
            if "quantity" not in missing:
                missing.append("quantity")

    # Validate required_by_date is not in the past
    rbd = result.get("required_by_date")
    if rbd:
        try:
            parsed_date = date.fromisoformat(str(rbd))
            if parsed_date < date.today():
                result["required_by_date"] = None
                if "required_by_date" not in missing:
                    missing.append("required_by_date")
        except (ValueError, TypeError):
            result["required_by_date"] = None
            if "required_by_date" not in missing:
                missing.append("required_by_date")

    result["missing_fields"] = missing
    return result
