import type {
  ActiveSubscription,
  AiModel,
  LedgerEntry,
  ModelKind,
  Note,
  NoteGroup,
  NoteType,
  PaymentChannel,
  Recording,
  RecordingStatus,
  Space,
  SubscriptionPlan,
  UserKey,
} from '../../core/domain';

/**
 * snake_case rows in, domain objects out.
 *
 * Every column name in the app is confined to this file and the adapters
 * beside it. Renaming a column, or moving to a store that spells things
 * differently, stops here instead of rippling into hooks and screens.
 */

export interface NoteRow {
  id: string;
  title: string | null;
  content: string;
  type: NoteType;
  color: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  parent_id: string | null;
  space_id: string;
  due_at: string | null;
  created_at: string;
}

export const NOTE_COLUMNS =
  'id, title, content, type, color, x, y, width, height, parent_id, space_id, due_at, created_at';

export const toNote = (row: NoteRow | Record<string, unknown>): Note => ({
  id: row.id as string,
  title: (row.title as string) ?? null,
  content: row.content as string,
  type: (row.type as NoteType) ?? 'idea',
  color: (row.color as string) ?? '#FFF8BC',
  x: row.x as number,
  y: row.y as number,
  width: (row.width as number) ?? 250,
  height: (row.height as number) ?? 190,
  parentId: (('parent_id' in row ? row.parent_id : (row as unknown as Note).parentId) ?? null) as string | null,
  spaceId: ('space_id' in row ? row.space_id : (row as unknown as Note).spaceId) as string,
  dueAt: (('due_at' in row ? row.due_at : (row as unknown as Note).dueAt) ?? null) as string | null,
  createdAt: ('created_at' in row ? row.created_at : (row as unknown as Note).createdAt) as string,
});

export const SPACE_COLUMNS = 'id, name, emoji, note_count, last_activity_at';

export const toSpace = (row: Record<string, unknown>): Space => ({
  id: row.id as string,
  name: row.name as string,
  emoji: row.emoji as string,
  noteCount: (row.note_count as number) ?? 0,
  lastActivityAt: row.last_activity_at as string,
});

export const GROUP_COLUMNS = 'id, title, x, y, width, height, color';

export const toGroup = (row: Record<string, unknown>): NoteGroup => ({
  id: row.id as string,
  title: (row.title as string) ?? null,
  x: row.x as number,
  y: row.y as number,
  width: (row.width as number) ?? 300,
  height: (row.height as number) ?? 240,
  color: (row.color as string) ?? '#F5F5F7',
});

export const toLedgerEntry = (row: Record<string, unknown>): LedgerEntry => ({
  id: typeof row.id === 'number' ? row.id : Number(row.id),
  delta: row.delta as number,
  balanceAfter: row.balance_after as number,
  reason: row.reason as string,
  createdAt: row.created_at as string,
});

export const toAiModel = (row: Record<string, unknown>): AiModel => ({
  id: row.id as string,
  provider: row.provider as string,
  modelId: row.model_id as string,
  displayName: row.display_name as string,
  kind: (row.kind as ModelKind) ?? 'chat',
  creditMultiplier: Number(row.credit_multiplier),
  tier: row.tier as string,
  isDefault: Boolean(row.is_default),
});

export const toUserKey = (row: Record<string, unknown>): UserKey => ({
  id: row.id as string,
  provider: row.provider as string,
  label: row.label as string,
  keyHint: row.key_hint as string,
  isActive: Boolean(row.is_active),
  lastError: (row.last_error as string) ?? null,
  createdAt: row.created_at as string,
});

export const toPlan = (row: Record<string, unknown>): SubscriptionPlan => ({
  id: row.id as string,
  name: row.name as string,
  tagline: (row.tagline as string) ?? '',
  priceEgp: row.price_egp as number,
  totalCredits: row.total_credits as number,
  bonusPct: (row.bonus_pct as number) ?? 0,
  isFeatured: Boolean(row.is_featured),
  maxRecordingMinutes: (row.max_recording_minutes as number) ?? 0,
  isByok: Boolean(row.is_byok),
  aiEnabled: row.ai_enabled === undefined ? row.id !== 'free' : Boolean(row.ai_enabled),
});

export const toSubscription = (row: Record<string, unknown>): ActiveSubscription => ({
  id: row.id as string,
  planId: row.plan_id as string,
  status: (row.status as ActiveSubscription['status']) ?? 'active',
  channel: (row.channel as PaymentChannel) ?? 'test_pay',
  currentPeriodEnd: row.current_period_end as string,
});

export const toRecording = (raw: Record<string, unknown>): Recording => {
  const transcripts = raw.transcripts as Array<Record<string, unknown>> | undefined;
  const stickyNotes = raw.sticky_notes as Array<Record<string, unknown>> | undefined;
  return {
    id: raw.id as string,
    status: (raw.status as RecordingStatus) ?? 'completed',
    error: (raw.error as string) ?? null,
    durationMs: raw.duration_ms as number,
    createdAt: raw.created_at as string,
    storagePath: raw.storage_path as string,
    transcript: (transcripts?.[0]?.text as string) ?? null,
    notes: (stickyNotes ?? [])
      .filter((n) => !n.deleted_at)
      .map((n) => ({
        id: n.id as string,
        title: (n.title as string) ?? null,
        content: n.content as string,
        type: n.type as NoteType,
        color: n.color as string,
      })),
  };
};
