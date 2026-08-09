import { supabase } from '../../../lib/supabase/client';

export type ModelKind = 'chat' | 'transcribe';

export interface AiModel {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  kind: ModelKind;
  /** Multiplies the base credit cost of an action. 0.5 = half price. */
  creditMultiplier: number;
  tier: string;
  isDefault: boolean;
}

/** Which model each kind falls back to when the user has no preference. */
export interface ModelPreferences {
  chatModelId: string | null;
  transcribeModelId: string | null;
}

export async function fetchModels(): Promise<AiModel[]> {
  const { data, error } = await supabase
    .from('ai_models')
    .select('id, provider, model_id, display_name, kind, credit_multiplier, tier, is_default')
    .eq('enabled', true)
    .order('kind')
    .order('sort_order');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    modelId: row.model_id,
    displayName: row.display_name,
    kind: row.kind as ModelKind,
    creditMultiplier: Number(row.credit_multiplier),
    tier: row.tier,
    isDefault: row.is_default,
  }));
}

export async function fetchModelPreferences(): Promise<ModelPreferences> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { chatModelId: null, transcribeModelId: null };

  const { data, error } = await supabase
    .from('profiles')
    .select('chat_model_id, transcribe_model_id')
    .eq('id', auth.user.id)
    .single();

  if (error) throw error;
  return {
    chatModelId: data.chat_model_id,
    transcribeModelId: data.transcribe_model_id,
  };
}

/**
 * Writes the preference onto profiles. The client can only touch preference
 * columns — the t_guard_profile trigger rejects any update that also moves
 * credits_balance / credits_reserved.
 *
 * Passing null clears the preference, which sends the user back to whichever
 * model is flagged is_default.
 */
export async function setModelPreference(kind: ModelKind, modelRowId: string | null): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not_signed_in');

  const column = kind === 'chat' ? 'chat_model_id' : 'transcribe_model_id';
  const { error } = await supabase
    .from('profiles')
    .update({ [column]: modelRowId })
    .eq('id', auth.user.id);

  if (error) throw error;
}
