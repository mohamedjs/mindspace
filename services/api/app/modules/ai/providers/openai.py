import logging

import httpx

from app.core.errors import AppError
from app.modules.ai.providers.base import ProviderCompletion

logger = logging.getLogger("ai.providers.openai")


class OpenAIProvider:
    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._api_key = api_key
        self._base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    async def chat(
        self,
        *,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool = True,
        temperature: float = 0.2,
    ) -> ProviderCompletion:
        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        payload: dict = {
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                logger.error("OpenAI provider error (%d): %s", resp.status_code, resp.text)
                raise AppError("ai_provider_error", f"OpenAI error: {resp.text}", 502)

            data = resp.json()
            choice = data["choices"][0]
            content = choice["message"]["content"]
            usage = data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)

            return ProviderCompletion(
                text=content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )

    async def transcribe(
        self,
        *,
        model_id: str,
        audio_bytes: bytes,
        filename: str = "audio.m4a",
    ) -> tuple[str, str | None]:
        url = f"{self._base_url}/audio/transcriptions"
        headers = {"Authorization": f"Bearer {self._api_key}"}
        files = {"file": (filename, audio_bytes, "audio/m4a")}
        data = {"model": model_id}

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, data=data, files=files)
            if resp.status_code != 200:
                logger.error("OpenAI transcribe error (%d): %s", resp.status_code, resp.text)
                raise AppError("ai_provider_error", f"OpenAI transcribe error: {resp.text}", 502)

            res_data = resp.json()
            return res_data.get("text", "").strip(), res_data.get("language")
