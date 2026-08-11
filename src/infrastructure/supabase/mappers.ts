import type {
  ActiveSubscription,
  AiModel,
  LedgerEntry,
  Note,
  NoteGroup,
  NoteType,
  Recording,
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

export const toNote = (row: NoteRow): Note => ({
  id: row.id,
  title: row.title,
  content: row.content,
  type: row.type,
  color: row.color,
  x: row.x,
  y: row.y,
  width: row.width,
  height: row.height,
  parentId: row.parent_id,
  spaceId: row.space_id,
  dueAt: row.due_at,
  createdAt: row.created_at,
});

export const SPACE_COLUMNS = 'id, name, emoji, note_count, last_activity_at';

export const toSpace = (row: Record<string, any>): Space => ({
  id: row.id,
  name: row.name,
  emoji: row.emoji,
  noteCount: row.note_count,
  lastActivityAt: row.last_activity_at,
});

export const GROUP_COLUMNS = 'id, title, x, y, width, height, color';

export const toGroup = (row: Record<string, any>): NoteGroup => ({
  id: row.id,
  title: row.title,
  x: row.x,
  y: row.y,
  width: row.width,
  height: row.height,
  color: row.color,
});

export const toLedgerEntry = (row: Record<string, any>): LedgerEntry => ({
  id: row.id,
  delta: row.delta,
  balanceAfter: row.balance_after,
  reason: row.reason,
  createdAt: row.created_at,
});

export const toAiModel = (row: Record<string, any>): AiModel => ({
  id: row.id,
  provider: row.provider,
  modelId: row.model_id,
  displayName: row.display_name,
  kind: row.kind,
  creditMultiplier: Number(row.credit_multiplier),
  tier: row.tier,
  isDefault: row.is_default,
});

export const toUserKey = (row: Record<string, any>): UserKey => ({
  id: row.id,
  provider: row.provider,
  label: row.label,
  keyHint: row.key_hint,
  isActive: row.is_active,
  lastError: row.last_error,
  createdAt: row.created_at,
});

export const toPlan = (row: Record<string, any>): SubscriptionPlan => ({
  id: row.id,
  name: row.name,
  tagline: row.tagline,
  priceEgp: row.price_egp,
  totalCredits: row.total_credits,
  bonusPct: row.bonus_pct,
  isFeatured: row.is_featured,
  maxRecordingMinutes: row.max_recording_minutes,
  isByok: row.is_byok,
});

export const toSubscription = (row: Record<string, any>): ActiveSubscription => ({
  id: row.id,
  planId: row.plan_id,
  status: row.status,
  channel: row.channel,
  currentPeriodEnd: row.current_period_end,
});

export const toRecording = (raw: Record<string, any>): Recording => ({
  id: raw.id,
  status: raw.status,
  error: raw.error,
  durationMs: raw.duration_ms,
  createdAt: raw.created_at,
  storagePath: raw.storage_path,
  transcript: raw.transcripts?.[0]?.text ?? null,
  // Deleted notes stay in the table for undo — don't resurrect them here.
  notes: (raw.sticky_notes ?? [])
    .filter((n: Record<string, any>) => !n.deleted_at)
    .map(({ id, title, content, type, color }: Record<string, any>) => ({
      id,
      title,
      content,
      type,
      color,
    })),
});
