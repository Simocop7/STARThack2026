"""Shared Azure OpenAI client singleton."""

from __future__ import annotations

import os
from functools import lru_cache

from openai import AsyncAzureOpenAI


@lru_cache(maxsize=1)
def get_azure_client() -> AsyncAzureOpenAI:
    api_key = os.environ.get("AZURE_OPENAI_API_KEY")
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    if not api_key or not endpoint:
        raise RuntimeError(
            "Missing required environment variables: "
            "AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT must be set."
        )
    return AsyncAzureOpenAI(
        api_key=api_key,
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
        azure_endpoint=endpoint,
        timeout=30.0,
        max_retries=2,
    )
