from app.modules.ai.enums import ProviderId
from app.modules.ai.providers.anthropic import AnthropicProvider
from app.modules.ai.providers.base import BaseChatProvider
from app.modules.ai.providers.google import GoogleProvider
from app.modules.ai.providers.openai import OpenAIProvider
from app.modules.ai.providers.openrouter import OpenRouterProvider


def get_chat_provider(
    provider_id: ProviderId,
    api_key: str,
    base_url: str | None = None,
) -> BaseChatProvider:
    if provider_id == ProviderId.openrouter:
        return OpenRouterProvider(api_key, base_url or "https://openrouter.ai/api/v1")
    elif provider_id == ProviderId.anthropic:
        return AnthropicProvider(api_key, base_url)
    elif provider_id == ProviderId.google:
        return GoogleProvider(api_key, base_url)
    elif provider_id in (ProviderId.openai, ProviderId.custom, ProviderId.nvidia):
        return OpenAIProvider(api_key, base_url)
    else:
        return OpenAIProvider(api_key, base_url)
