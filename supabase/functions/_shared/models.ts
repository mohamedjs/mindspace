import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './auth.ts';

export type ModelKind = 'chat' | 'transcribe';

export interface AiModel {
  id: string;
  provider: string;
  model_id: string;
  kind: ModelKind;
  input_price_m: number | null;
  output_price_m: number | null;
  price_per_min: number | null;
  credit_multiplier: number;
  byok_only: boolean;
}

const PREFERENCE_COLUMN: Record<ModelKind, string> = {
  chat: 'chat_model_id',
  transcribe: 'transcribe_model_id',
};

/**
 * Resolves which model to use: the user's saved preference if it's still
 * enabled and of the right kind, otherwise a model on a provider they hold a
 * key for, otherwise the default for that kind.
 *
 * That middle step exists to close a silent billing bug. resolveApiKey looks
 * up a key by the *resolved model's* provider — so a user who saved an
 * Anthropic key but whose stored preference still points at an OpenRouter row
 * would run on OpenRouter, find no user key there, fall back to the platform
 * key, and be charged credits, while the UI showed Anthropic. Preferring a
 * provider they actually hold a key for keeps the two in agreement.
 */
export async function resolveModel(
  db: SupabaseClient,
  kind: ModelKind,
  userId: string
): Promise<AiModel> {
  const column = PREFERENCE_COLUMN[kind];

  const { data: profile } = await db
    .from('profiles')
    .select(column)
    .eq('id', userId)
    .single();

  const preferredId = (profile as Record<string, string | null> | null)?.[column];

  if (preferredId) {
    const { data: preferred } = await db
      .from('ai_models')
      .select('*')
      .eq('id', preferredId)
      .eq('kind', kind)
      .eq('enabled', true)
      .maybeSingle();

    if (preferred) return preferred as AiModel;
  }

  // No usable preference. For chat, stay on a provider the user actually holds
  // a key for rather than dropping onto the platform default and billing them.
  //
  // Transcription deliberately does NOT do this: speech-to-text always runs on
  // the platform's OpenRouter key and is paid for in credits, even on the BYOK
  // plan. Following the user's key here would silently route audio to a
  // provider they only meant to use for text.
  if (kind === 'chat') {
    const { data: userKeys } = await db
      .from('user_ai_keys')
      .select('provider')
      .eq('user_id', userId)
      .eq('is_active', true);

    const providers = (userKeys ?? []).map((k) => k.provider);
    if (providers.length) {
      const { data: onOwnKey } = await db
        .from('ai_models')
        .select('*')
        .eq('kind', kind)
        .eq('enabled', true)
        .in('provider', providers)
        .order('sort_order')
        .limit(1)
        .maybeSingle();

      if (onOwnKey) return onOwnKey as AiModel;
    }
  }

  const { data: fallback, error } = await db
    .from('ai_models')
    .select('*')
    .eq('kind', kind)
    .eq('is_default', true)
    .eq('enabled', true)
    .maybeSingle();

  if (error || !fallback) {
    throw new HttpError(500, 'no_model_available', `no default ${kind} model configured`);
  }

  return fallback as AiModel;
}
