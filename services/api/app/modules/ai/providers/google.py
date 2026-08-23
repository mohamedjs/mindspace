import logging

import httpx

from app.core.errors import AppError
from app.modules.ai.providers.base import ProviderCompletion

logger = logging.getLogger("ai.providers.google")


class GoogleProvider:
    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._api_key = api_key
        self._base_url = (base_url or "https://generativelanguage.googleapis.com/v1beta").rstrip(
            "/"
        )

    async def chat(
        self,
        *,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool = True,
        temperature: float = 0.2,
    ) -> ProviderCompletion:
        # Strip provider prefix if present
        clean_model = model_id.split("/")[-1]
        url = f"{self._base_url}/models/{clean_model}:generateContent?key={self._api_key}"
        headers = {"Content-Type": "application/json"}

        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "response_mime_type": "application/json" if json_mode else "text/plain",
            },
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                logger.error("Google provider error (%d): %s", resp.status_code, resp.text)
                raise AppError("ai_provider_error", f"Google AI error: {resp.text}", 502)

            data = resp.json()
            candidate = data["candidates"][0]
            content = candidate["content"]["parts"][0]["text"]
            usage = data.get("usageMetadata", {})
            input_tokens = usage.get("promptTokenCount", 0)
            output_tokens = usage.get("candidatesTokenCount", 0)

            return ProviderCompletion(
                text=content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
