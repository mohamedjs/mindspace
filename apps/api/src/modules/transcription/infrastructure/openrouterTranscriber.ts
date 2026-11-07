import { streamToBase64 } from '../../../platform/blob.js';
import type { TranscribeRequest, TranscribeResult } from '../domain/entities.js';
import { ProviderError, ProviderTimeoutError } from '../domain/errors.js';
import type { Transcriber } from '../domain/ports.js';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_DEADLINE_MS = 120_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 200;

const TRANSCRIBE_SYSTEM =
  'You are a transcription engine. Transcribe the audio verbatim in its original ' +
  'language. Output only the transcript text — no preamble, no commentary, no ' +
  'translation, no speaker labels unless spoken.';

export interface OpenRouterTranscriberOptions {
  baseUrl?: string;
  deadlineMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  fetchFn?: typeof globalThis.fetch;
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export class OpenRouterTranscriber implements Transcriber {
  private readonly defaultBaseUrl: string;
  private readonly deadlineMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(options?: OpenRouterTranscriberOptions) {
    this.defaultBaseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
    this.deadlineMs = options?.deadlineMs ?? DEFAULT_DEADLINE_MS;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
  }

  async transcribe(request: TranscribeRequest): Promise<TranscribeResult> {
    if (request.signal?.aborted) {
      throw request.signal.reason ?? new Error('Aborted');
    }

    // Read audio by stream and encode to base64 per part, never all parts at once
    const base64Audio = await streamToBase64(request.audioStream);

    if (request.signal?.aborted) {
      throw request.signal.reason ?? new Error('Aborted');
    }

    const baseUrl = request.baseUrl || this.defaultBaseUrl;
    const payload = {
      model: request.model,
      messages: [
        { role: 'system', content: TRANSCRIBE_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe this recording.' },
            { type: 'input_audio', input_audio: { data: base64Audio, format: request.format } },
          ],
        },
      ],
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (request.signal?.aborted) {
        throw request.signal.reason ?? new Error('Aborted');
      }

      const timeoutSignal = AbortSignal.timeout(this.deadlineMs);
      const signal = request.signal
        ? AbortSignal.any([timeoutSignal, request.signal])
        : timeoutSignal;

      let res: Response;
      try {
        res = await this.fetchFn(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${request.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal,
        });
      } catch (err: any) {
        if (request.signal?.aborted) {
          throw request.signal.reason ?? new Error('Aborted');
        }
        if (
          timeoutSignal.aborted ||
          (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) ||
          err?.name === 'TimeoutError'
        ) {
          throw new ProviderTimeoutError(
            `transcribe-chat took longer than ${this.deadlineMs / 1000}s`
          );
        }
        throw new ProviderError('Speech-to-text network failure');
      }

      if (res.ok) {
        const body = (await res.json()) as any;
        const content = body?.choices?.[0]?.message?.content;
        const text = Array.isArray(content)
          ? content.map((part: { text?: string }) => part.text ?? '').join('')
          : typeof content === 'string'
            ? content
            : '';

        return {
          text,
          language: typeof body?.language === 'string' ? body.language : null,
        };
      }

      const isRetryable = res.status === 429 || (res.status >= 500 && res.status <= 599);
      if (isRetryable && attempt < this.maxRetries) {
        const jitter = 0.5 + Math.random() * 0.5;
        const backoffMs = this.baseDelayMs * Math.pow(2, attempt) * jitter;
        await sleepWithAbort(backoffMs, request.signal);
        continue;
      }

      throw new ProviderError(
        `transcribe-chat ${res.status} (model=${request.model}, format=${request.format})`
      );
    }

    throw new ProviderError('transcribe-chat exhausted retries');
  }
}
