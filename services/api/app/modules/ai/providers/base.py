from decimal import Decimal
from typing import NamedTuple, Protocol


class ProviderCompletion(NamedTuple):
    text: str
    input_tokens: int
    output_tokens: int
    raw_cost_usd: Decimal | None = None


class BaseChatProvider(Protocol):
    async def chat(
        self,
        *,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool = True,
        temperature: float = 0.2,
    ) -> ProviderCompletion: ...
