"""Parse voice transcripts into structured procurement form fields using Azure OpenAI."""

from __future__ import annotations

import json
import os
from typing import Any

from api.azure_client import get_azure_client

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
                    "description": "The cleaned-up version of the voice transcript as a procurement request description.",
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
                "missing_fields",
            ],
        },
    },
}


async def parse_voice_transcript(transcript: str, language: str, today: str) -> dict[str, Any]:
    """Use LLM to extract structured form fields from a voice transcript."""
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
1. Clean up the transcript into a proper procurement request description (correct obvious speech-to-text errors)
2. Extract quantity, unit of measure, deadline, and preferred supplier
3. Convert relative dates to absolute ISO dates (YYYY-MM-DD) based on today's date
4. List any important fields that are missing and should be filled manually by the user

IMPORTANT:
- Fix obvious speech recognition errors (e.g. "lampadaijne" → "lampadine", "filips" → "Philips")
- The request_text should be a clean, well-formed version of what the user meant to say
- If the user mentions a brand/supplier, extract it as preferred_supplier
- For countable items (e.g. laptops, lightbulbs, chairs, licenses), the unit_of_measure is obvious ("unit", "device", etc.) — you can auto-fill it or leave it null; do NOT add it to missing_fields.
- For items measured by weight, volume, length, or time (e.g. flour, cable, consulting hours), unit_of_measure is critical. If the user did not specify it, set unit_of_measure to null and ADD "unit_of_measure" to missing_fields.
- If quantity is not mentioned, set it to null
- missing_fields should include things like "budget" if not mentioned — but only truly important procurement fields"""

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

    return result
