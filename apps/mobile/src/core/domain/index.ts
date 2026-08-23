/**
 * The domain: what MindSpace is about, described without reference to how any
 * of it is stored or displayed.
 *
 * Nothing here imports React, Expo, or a database driver — enforced by
 * architecture.test.ts. Every layer points inward at these types; this layer
 * points at nothing. That is what lets the storage behind it change without
 * the rest of the app noticing.
 */

export type NoteType =
  | 'idea'
  | 'task'
  | 'question'
  | 'decision'
  | 'reference'
  | 'thought'
  | 'summary';

/**
 * A single thought on the board.
 *
 * This type previously lived in StickyNoteItem.tsx and was imported by
 * thirteen modules, which made a presentation component the source of truth
 * for the app's central entity. It belongs here.
 */
export interface Note {
  id: string;
  title?: string | null;
  content: string;
  type: NoteType;
  color?: string | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  /** Null for a top-level idea; the parent's id for a sub-note. */
  parentId?: string | null;
  spaceId?: string;
  /** ISO instant the note is for, when the speaker named a time. */
  dueAt?: string | null;
  /** When the note was written. The calendar's fallback for undated notes. */
  createdAt?: string;
}

export interface Space {
  id: string;
  name: string;
  emoji: string;
  noteCount: number;
  lastActivityAt: string;
}

/** A labelled region drawn behind the notes; membership is spatial. */
export interface NoteGroup {
  id: string;
  title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
}

export type RecordingStatus =
  | 'recorded'
  | 'uploading'
  | 'transcribing'
  | 'transcribed'
  | 'extracting'
  | 'completed'
  | 'failed';

export interface RecordingNote {
  id: string;
  title: string | null;
  content: string;
  type: string;
  color: string | null;
}

export interface Recording {
  id: string;
  status: RecordingStatus;
  error: string | null;
  durationMs: number;
  createdAt: string;
  /** Null once the audio has been removed server-side after transcription. */
  storagePath: string | null;
  transcript: string | null;
  notes: RecordingNote[];
}

export interface CreditBalance {
  creditsBalance: number;
  creditsReserved: number;
}

export interface LedgerEntry {
  id: number;
  delta: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

export type ModelKind = 'chat' | 'transcribe';

export interface AiModel {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  kind: ModelKind;
  creditMultiplier: number;
  tier: string;
  isDefault: boolean;
}

export interface ModelPreferences {
  chatModelId: string | null;
  transcribeModelId: string | null;
}

export interface Profile {
  displayName: string | null;
  email: string | null;
}

export interface UserKey {
  id: string;
  provider: string;
  label: string | null;
  keyHint: string;
  isActive: boolean;
  lastError: string | null;
  createdAt: string;
}

export type PaymentChannel = 'google_pay' | 'apple_pay' | 'instapay' | 'test_pay';

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline: string | null;
  priceEgp: number;
  totalCredits: number;
  bonusPct: number;
  isFeatured: boolean;
  maxRecordingMinutes: number;
  isByok: boolean;
  /**
   * Whether this plan can use the voice pipeline at all.
   *
   * False only on Free, which gets every board, note, group, list, calendar and
   * reminder feature with the AI switched off. An entitlement, not a balance —
   * a plan without it never reaches the code that spends credits.
   */
  aiEnabled: boolean;
}

export interface ActiveSubscription {
  id: string;
  planId: string;
  status: 'pending' | 'active' | 'cancelled' | 'expired';
  channel: PaymentChannel;
  currentPeriodEnd: string | null;
}

export interface ProviderOption {
  channel: PaymentChannel;
  displayName: string;
  isConfigured: boolean;
}

export interface ChargeIntent {
  channel: PaymentChannel;
  reference: string;
  amountEgp: number;
  payload: Record<string, unknown>;
}

export interface StartSubscriptionResult {
  subscriptionId: string;
  reference?: string;
  plan: { id: string; name: string; priceEgp: number; credits: number };
  intent?: ChargeIntent;
  free?: boolean;
}

export interface ConfirmSubscriptionResult {
  subscriptionId: string;
  status: string;
  creditsGranted: number;
  alreadyActive?: boolean;
}

/** An authenticated person, as the app cares about them. */
export interface AuthUser {
  id: string;
  email: string | null;
  fullName: string | null;
}
