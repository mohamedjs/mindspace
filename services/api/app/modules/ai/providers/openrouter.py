import logging
from decimal import Decimal

import httpx

from app.core.errors import AppError
from app.modules.ai.providers.base import ProviderCompletion

logger = logging.getLogger("ai.providers.openrouter")


class OpenRouterProvider:
    def __init__(self, api_key: str, base_url: str = "https://openrouter.ai/api/v1") -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

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
            "HTTP-Referer": "https://mindspace.app",
            "X-Title": "MindSpace",
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
                logger.error("OpenRouter error (%d): %s", resp.status_code, resp.text)
                raise AppError("ai_provider_error", f"OpenRouter error: {resp.text}", 502)

            data = resp.json()
            choice = data["choices"][0]
            content = choice["message"]["content"]
            usage = data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)

            raw_cost = None
            if "total_cost" in usage:
                try:
                    raw_cost = Decimal(str(usage["total_cost"]))
                except Exception:
                    pass

            return ProviderCompletion(
                text=content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                raw_cost_usd=raw_cost,
            )

    async def transcribe_via_chat(
        self,
        *,
        model_id: str,
        audio_bytes: bytes,
        audio_format: str = "m4a",
    ) -> tuple[str, str | None]:
        import base64

        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "HTTP-Referer": "https://mindspace.app",
            "X-Title": "MindSpace",
            "Content-Type": "application/json",
        }
        b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
        system_prompt = (
            "You are a transcription engine. Transcribe the audio verbatim in its original language. "
            "Output only the transcript text — no preamble, no commentary, no translation, no speaker labels unless spoken."
        )
        payload = {
            "model": model_id,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Transcribe this recording."},
                        {
                            "type": "input_audio",
                            "input_audio": {"data": b64_audio, "format": audio_format},
                        },
                    ],
                },
            ],
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                logger.error("OpenRouter transcribe error (%d): %s", resp.status_code, resp.text)
                raise AppError(
                    "ai_provider_error", f"OpenRouter transcribe error: {resp.text}", 502
                )

            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            text = (
                "".join(p.get("text", "") for p in content)
                if isinstance(content, list)
                else (content or "")
            )
            return text.strip(), None
