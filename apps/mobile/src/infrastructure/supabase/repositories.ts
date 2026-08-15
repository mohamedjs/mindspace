import type {
  AccountRepository,
  BillingRepository,
  CreateGroupInput,
  CreditRepository,
  GroupPatch,
  GroupRepository,
  KeyRepository,
  ModelRepository,
  RecordingRepository,
  SaveKeyInput,
  SpaceRepository,
} from '../../core/ports';
import type { ModelKind, PaymentChannel } from '../../core/domain';
import { supabase } from './client';
import { supabaseFunctions } from './functions';
import {
  GROUP_COLUMNS,
  SPACE_COLUMNS,
  toAiModel,
  toGroup,
  toLedgerEntry,
  toPlan,
  toRecording,
  toSpace,
  toSubscription,
  toUserKey,
} from './mappers';

/** The signed-in user's id, or a thrown error. Several repos need it. */
async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('not_signed_in');
  return data.user.id;
}

export const supabaseSpaceRepository: SpaceRepository = {
  async list() {
    const { data, error } = await supabase
      .from('spaces')
      .select(SPACE_COLUMNS)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toSpace);
  },

  async create(name: string, emoji = '💡') {
    const { data, error } = await supabase
      .from('spaces')
      .insert({ name, emoji })
      .select(SPACE_COLUMNS)
      .single();
    if (error) throw error;
    return toSpace(data);
  },

  async rename(spaceId: string, name: string) {
    const { error } = await supabase
      .from('spaces')
      .update({ name: name.trim() })
      .eq('id', spaceId);
    if (error) throw error;
  },

  /** Soft delete so notes and provenance survive. */
  async remove(spaceId: string) {
    const { error } = await supabase
      .from('spaces')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', spaceId);
    if (error) throw error;
  },
};

export const supabaseGroupRepository: GroupRepository = {
  async listBySpace(spaceId: string) {
    const { data, error } = await supabase
      .from('note_groups')
      .select(GROUP_COLUMNS)
      .eq('space_id', spaceId)
      .is('deleted_at', null);
    if (error) throw error;
    return (data ?? []).map(toGroup);
  },

  async create(spaceId: string, group: CreateGroupInput) {
    const { data, error } = await supabase
      .from('note_groups')
      .insert({
        space_id: spaceId,
        title: group.title ?? null,
        x: group.x,
        y: group.y,
        ...(group.width ? { width: group.width } : {}),
        ...(group.height ? { height: group.height } : {}),
      })
      .select(GROUP_COLUMNS)
      .single();
    if (error) throw error;
    return toGroup(data);
  },

  async update(groupId: string, fields: GroupPatch) {
    const { error } = await supabase.from('note_groups').update(fields).eq('id', groupId);
    if (error) throw error;
  },

  /** Soft delete: the frame goes, the notes inside stay. */
  async remove(groupId: string) {
    const { error } = await supabase
      .from('note_groups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', groupId);
    if (error) throw error;
  },
};

export const supabaseRecordingRepository: RecordingRepository = {
  /**
   * Every recording that fed this space, newest first, with the transcript and
   * the notes it produced. sticky_notes.recording_id is the provenance link.
   */
  async listBySpace(spaceId: string) {
    const { data, error } = await supabase
      .from('recordings')
      .select(
        `id, status, error, duration_ms, created_at, storage_path,
         transcripts ( text ),
         sticky_notes ( id, title, content, type, color, deleted_at )`
      )
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map((raw) => toRecording(raw as Record<string, any>));
  },

  async create({ spaceId, durationMs }) {
    const { data, error } = await supabase
      .from('recordings')
      .insert({ space_id: spaceId, duration_ms: durationMs, status: 'recorded' })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  },

  async markFailed(recordingId: string, errorText: string) {
    const { error } = await supabase
      .from('recordings')
      .update({ status: 'failed', error: errorText })
      .eq('id', recordingId);
    if (error) throw error;
  },

  /**
   * Extraction is the last step, so this is where a recording is really done.
   * Clearing `error` drops a stale failure from an earlier attempt, which the
   * status banner would otherwise keep showing forever.
   */
  async markCompleted(recordingId: string) {
    const { error } = await supabase
      .from('recordings')
      .update({ status: 'completed', error: null })
      .eq('id', recordingId);
    if (error) throw error;
  },

  async findTranscriptId(recordingId: string) {
    const { data } = await supabase
      .from('transcripts')
      .select('id')
      .eq('recording_id', recordingId)
      .maybeSingle();
    return data?.id ?? null;
  },

  async getStatus(recordingId: string) {
    const { data } = await supabase
      .from('recordings')
      .select('status, error')
      .eq('id', recordingId)
      .single();
    return data ? { status: data.status, error: data.error ?? null } : null;
  },
};

export const supabaseCreditRepository: CreditRepository = {
  async getBalance() {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('profiles')
      .select('credits_balance, credits_reserved')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return { creditsBalance: data.credits_balance, creditsReserved: data.credits_reserved };
  },

  async listLedger(limit = 50, offset = 0) {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('credit_ledger')
      .select('id, delta, balance_after, reason, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return (data ?? []).map(toLedgerEntry);
  },
};

export const supabaseModelRepository: ModelRepository = {
  async list() {
    const { data, error } = await supabase
      .from('ai_models')
      .select('id, provider, model_id, display_name, kind, credit_multiplier, tier, is_default')
      .eq('enabled', true)
      .order('kind')
      .order('sort_order');
    if (error) throw error;
    return (data ?? []).map(toAiModel);
  },

  async getPreferences() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { chatModelId: null, transcribeModelId: null };

    const { data, error } = await supabase
      .from('profiles')
      .select('chat_model_id, transcribe_model_id')
      .eq('id', auth.user.id)
      .single();
    if (error) throw error;
    return { chatModelId: data.chat_model_id, transcribeModelId: data.transcribe_model_id };
  },

  /**
   * The client may only touch preference columns — the t_guard_profile trigger
   * rejects any update that also moves credits.
   */
  async setPreference(kind: ModelKind, modelRowId: string | null) {
    const userId = await requireUserId();
    const column = kind === 'chat' ? 'chat_model_id' : 'transcribe_model_id';
    const { error } = await supabase
      .from('profiles')
      .update({ [column]: modelRowId })
      .eq('id', userId);
    if (error) throw error;
  },
};

export const supabaseAccountRepository: AccountRepository = {
  async getProfile() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error('not_signed_in');

    const { data, error } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', auth.user.id)
      .single();
    if (error) throw error;

    return {
      displayName: data.display_name || auth.user.user_metadata?.full_name || null,
      email: auth.user.email ?? null,
    };
  },

  async updateDisplayName(name: string) {
    const userId = await requireUserId();
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim() })
      .eq('id', userId);
    if (error) throw error;
  },

  async deleteAccount() {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;
  },
};

export const supabaseKeyRepository: KeyRepository = {
  /**
   * encrypted_key is revoked from SELECT at the DB level (migration 0005), so
   * widening this list can never leak it.
   */
  async list() {
    const { data, error } = await supabase
      .from('user_ai_keys')
      .select('id, provider, label, key_hint, is_active, last_error, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toUserKey);
  },

  save(input: SaveKeyInput) {
    return supabaseFunctions.invoke<{ ok: true; keyHint: string }>('byok-save', { ...input });
  },

  async remove(keyId: string) {
    await supabaseFunctions.invoke('byok-delete', { keyId });
  },
};

export const supabaseBillingRepository: BillingRepository = {
  async listPlans() {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select(
        'id, name, tagline, price_egp, total_credits, bonus_pct, is_featured, max_recording_minutes, is_byok'
      )
      .eq('enabled', true)
      .order('sort_order');
    if (error) throw error;
    return (data ?? []).map(toPlan);
  },

  async getActiveSubscription() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;

    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, plan_id, status, channel, current_period_end')
      .eq('user_id', auth.user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toSubscription(data) : null;
  },

  async listPaymentProviders() {
    const result = await supabaseFunctions.invoke<{ providers: any[] }>(
      'subscribe-start',
      {},
      { method: 'GET' }
    );
    return result.providers;
  },

  start(planId: string, channel?: PaymentChannel) {
    return supabaseFunctions.invoke('subscribe-start', { planId, channel: channel ?? null });
  },

  confirm(subscriptionId: string, receipt: unknown) {
    return supabaseFunctions.invoke('subscribe-confirm', { subscriptionId, receipt });
  },
};
