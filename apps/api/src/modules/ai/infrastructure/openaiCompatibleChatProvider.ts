import type { ChatArgs, ChatResult } from '../domain/entities.js';
import { AiProviderError, AiTimeoutError } from '../domain/errors.js';
import type { AiChatProviderPort } from '../domain/ports.js';

const DEFAULT_TIMEOUT_MS = 120_000; // 120 seconds deadline

export class OpenAICompatibleChatProvider implements AiChatProviderPort {
  constructor(private readonly baseUrl = 'https://openrouter.ai/api/v1') {}

  async chat(args: ChatArgs): Promise<ChatResult> {
    const { apiKey, model, system, user, jsonMode, timeoutMs = DEFAULT_TIMEOUT_MS } = args;
    const url = `${this.baseUrl}/chat/completions`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || (err instanceof DOMException && err.name === 'TimeoutError')) {
        throw new AiTimeoutError();
      }
      throw new AiProviderError(502, `chat network error: ${err?.message ?? 'unknown'}`);
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new AiProviderError(res.status, `chat ${res.status}: ${errorText}`);
    }

    const data = (await res.json()) as any;
    const choice = data.choices?.[0];
    const text = choice?.message?.content ?? '';
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;

    return {
      text,
      inputTokens,
      outputTokens,
    };
  }
}
