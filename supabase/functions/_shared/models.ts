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
 * enabled and of the right kind, otherwise the default for that kind.
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
