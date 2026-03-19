"""ElevenLabs TTS client singleton for voice output."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import AsyncIterator

import httpx


class ElevenLabsClient:
    """Lightweight async wrapper around the ElevenLabs TTS REST API."""

    BASE_URL = "https://api.elevenlabs.io/v1"

    # Multilingual v2 model — supports all 7 target languages
    MODEL_ID = "eleven_multilingual_v2"

    # Default voice (Rachel — clear, professional, multilingual)
    DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers={"xi-api-key": api_key},
            timeout=30.0,
        )

    async def text_to_speech(
        self,
        text: str,
        voice_id: str | None = None,
    ) -> AsyncIterator[bytes]:
        """Stream TTS audio bytes (mp3) from ElevenLabs."""
        vid = voice_id or self.DEFAULT_VOICE_ID
        url = f"/text-to-speech/{vid}/stream"

        async with self._client.stream(
            "POST",
            url,
            json={
                "text": text,
                "model_id": self.MODEL_ID,
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                },
            },
        ) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(chunk_size=4096):
                yield chunk

    async def close(self) -> None:
        await self._client.aclose()


@lru_cache(maxsize=1)
def get_elevenlabs_client() -> ElevenLabsClient | None:
    """Return the singleton client, or None if API key is not configured."""
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        return None
    return ElevenLabsClient(api_key=api_key)
