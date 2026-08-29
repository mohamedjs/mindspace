import logging

import httpx

from app.core.errors import AppError
from app.modules.ai.providers.base import ProviderCompletion

logger = logging.getLogger("ai.providers.anthropic")


class AnthropicProvider:
    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._api_key = api_key
        self._base_url = (base_url or "https://api.anthropic.com/v1").rstrip("/")

    async def chat(
        self,
        *,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool = True,
        temperature: float = 0.2,
    ) -> ProviderCompletion:
        url = f"{self._base_url}/messages"
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model_id,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "temperature": temperature,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                logger.error("Anthropic provider error (%d): %s", resp.status_code, resp.text)
                raise AppError("ai_provider_error", f"Anthropic error: {resp.text}", 502)

            data = resp.json()
            content = data["content"][0]["text"]
            usage = data.get("usage", {})
            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)

            return ProviderCompletion(
                text=content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
