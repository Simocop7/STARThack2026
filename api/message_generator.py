"""Stage 3: Generate user-facing message with fix proposals in their language."""

from __future__ import annotations

import json
import os
from typing import Any

from api.azure_client import get_azure_client
from api.models import EnrichedRequest, UserMessage, UserMessageIssue, ValidationIssue


_SYSTEM_PROMPT = """You are a procurement assistant. Your job is to communicate validation results to the user in a clear, friendly, professional tone.

INSTRUCTIONS:
1. Write ENTIRELY in the user's language (specified below). All text — summary, titles, explanations, fixes — must be in that language.
2. If language is "en", write in English. If "fr", write in French. If "de", German. If "es", Spanish. If "pt", Portuguese. If "ja", Japanese. If "it", Italian.
3. For each issue, provide:
   - A short title (2-5 words)
   - A clear explanation of what's wrong
   - A concrete proposed fix the user can accept
   - The field name that needs fixing (if applicable)
   - The suggested value (if applicable)
4. If there are no issues, write a positive summary confirming the request looks good.
5. The corrected_json should be the enriched request with all fixes pre-applied.
6. Use the generate_message function to return your response."""

_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "generate_message",
        "description": "Generate the user-facing validation message.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "1-2 sentence overview of the validation result",
                },
                "issues": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "explanation": {"type": "string"},
                            "proposed_fix": {"type": "string"},
                            "fix_field": {"type": ["string", "null"]},
                            "fix_value": {"type": ["string", "null"]},
                        },
                        "required": ["title", "explanation", "proposed_fix"],
                    },
                },
                "all_ok_message": {
                    "type": "string",
                    "description": "Message to show when user accepts all fixes",
                },
            },
            "required": ["summary", "issues", "all_ok_message"],
        },
    },
}


async def generate_user_message(
    enriched: EnrichedRequest,
    issues: list[ValidationIssue],
    corrected: dict[str, Any],
    language: str = "en",
) -> UserMessage:
    """Call Azure OpenAI to produce a natural-language message in the user's language."""
    client = get_azure_client()
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

    issues_data = [
        {
            "issue_id": i.issue_id,
            "severity": i.severity.value,
            "type": i.type.value,
            "description": i.description,
            "proposed_fix": i.proposed_fix,
            "fix_field": i.fix_action.field if i.fix_action else None,
            "fix_value": i.fix_action.suggested_value if i.fix_action else None,
        }
        for i in issues
    ]

    user_msg = f"""Language: {language}

ENRICHED REQUEST:
{json.dumps(enriched.model_dump(mode="json"), indent=2)}

VALIDATION ISSUES ({len(issues)} found):
{json.dumps(issues_data, indent=2)}

CORRECTED JSON (with fixes pre-applied):
{json.dumps(corrected, indent=2)}

Generate the user message using the generate_message function."""

    response = await client.chat.completions.create(
        model=deployment,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        tools=[_TOOL_SCHEMA],
        tool_choice={"type": "function", "function": {"name": "generate_message"}},
    )

    message = response.choices[0].message
    if not message.tool_calls:
        raise RuntimeError("LLM did not return a tool call for message generation")

    try:
        tool_result: dict[str, Any] = json.loads(message.tool_calls[0].function.arguments)
    except (json.JSONDecodeError, IndexError, AttributeError) as exc:
        raise RuntimeError("LLM returned an unparseable response for message generation") from exc

    msg_issues: list[UserMessageIssue] = []
    for item in tool_result.get("issues", []):
        try:
            msg_issues.append(
                UserMessageIssue(
                    title=item.get("title", ""),
                    explanation=item.get("explanation", ""),
                    proposed_fix=item.get("proposed_fix", ""),
                    fix_field=item.get("fix_field"),
                    fix_value=item.get("fix_value"),
                )
            )
        except (TypeError, ValueError):
            continue  # skip malformed issue entries

    return UserMessage(
        summary=tool_result.get("summary", ""),
        issues=msg_issues,
        corrected_json=corrected,
        all_ok_message=tool_result.get("all_ok_message", ""),
    )
