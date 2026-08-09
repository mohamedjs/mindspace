import { HttpError } from '../auth.ts';

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TranscribeResult {
  text: string;
  language: string | null;
}

export interface ChatArgs {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  /** Ask the provider for strict JSON when the caller will parse the reply. */
  jsonMode?: boolean;
}

export interface TranscribeArgs {
  apiKey: string;
  model: string;
  audio: Blob;
  fileName?: string;
}

export interface TranscribeViaChatArgs {
  apiKey: string;
  model: string;
  audio: Blob;
  /** Container name the model expects: m4a, webm, wav, mp3… */
  format: string;
}

/**
 * A provider that never answers is worse than one that errors: the edge
 * function gets killed by the platform wall clock and the client only sees
 * "Edge Function returned a non-2xx status code" with no body to unwrap. Cap
 * it ourselves so a slow model produces a named error and the credit
 * reservation is released instead of stranded.
 */
const REQUEST_TIMEOUT_MS = 60_000;

async function postJson(url: string, apiKey: string, payload: unknown, label: string) {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new HttpError(
        504,
        'provider_timeout',
        `${label} took longer than ${REQUEST_TIMEOUT_MS / 1000}s — try a faster model`
      );
    }
    throw err;
  }
}

const TRANSCRIBE_SYSTEM =
  'You are a transcription engine. Transcribe the audio verbatim in its original ' +
  'language. Output only the transcript text — no preamble, no commentary, no ' +
  'translation, no speaker labels unless spoken.';

function toBase64(bytes: Uint8Array): string {
  // btoa needs a binary string; chunk it so large recordings don't blow the
  // argument limit on String.fromCharCode.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Every provider we target (OpenRouter, OpenAI, NVIDIA, most self-hosted
 * gateways) speaks the OpenAI wire format, so one factory covers them all.
 */
export function createOpenAICompatibleProvider(baseUrl: string) {
  return {
    async chat({ apiKey, model, system, user, jsonMode }: ChatArgs): Promise<ChatResult> {
      const res = await postJson(`${baseUrl}/chat/completions`, apiKey, {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }, 'chat');

      if (!res.ok) {
        throw new HttpError(502, 'provider_error', `chat ${res.status}: ${await res.text()}`);
      }

      const body = await res.json();
      return {
        text: body.choices?.[0]?.message?.content ?? '',
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      };
    },

    async transcribe({
      apiKey,
      model,
      audio,
      fileName = 'audio.m4a',
    }: TranscribeArgs): Promise<TranscribeResult> {
      const form = new FormData();
      form.append('file', audio, fileName);
      form.append('model', model);

      const res = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });

      if (!res.ok) {
        throw new HttpError(502, 'provider_error', `transcribe ${res.status}: ${await res.text()}`);
      }

      const body = await res.json();
      return { text: body.text ?? '', language: body.language ?? null };
    },

    /**
     * Transcription through /chat/completions using an `input_audio` content
     * part. OpenRouter has no /audio/transcriptions endpoint at all, so this is
     * the only way to transcribe on a platform OpenRouter key.
     *
     * Format support is per-model, not per-gateway: Gemini decodes m4a/webm,
     * while openai/gpt-audio* route to OpenAI and take only wav/mp3. Sending an
     * unsupported container surfaces as a provider_error naming the format.
     */
    async transcribeViaChat({
      apiKey,
      model,
      audio,
      format,
    }: TranscribeViaChatArgs): Promise<TranscribeResult> {
      const data = toBase64(new Uint8Array(await audio.arrayBuffer()));

      // No `modalities` — that parameter requests audio *output*; sending it
      // on an input-only request can be rejected by the upstream provider.
      const res = await postJson(`${baseUrl}/chat/completions`, apiKey, {
        model,
        messages: [
          { role: 'system', content: TRANSCRIBE_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcribe this recording.' },
              { type: 'input_audio', input_audio: { data, format } },
            ],
          },
        ],
      }, 'transcribe-chat');

      if (!res.ok) {
        throw new HttpError(
          502,
          'provider_error',
          `transcribe-chat ${res.status} (model=${model}, format=${format}): ${await res.text()}`
        );
      }

      const body = await res.json();
      const content = body.choices?.[0]?.message?.content;
      // Audio-capable models may return content as an array of parts.
      const text = Array.isArray(content)
        ? content.map((part: { text?: string }) => part.text ?? '').join('')
        : (content ?? '');

      return { text, language: null };
    },
  };
}

export type OpenAICompatibleProvider = ReturnType<typeof createOpenAICompatibleProvider>;
