import type {
  ActiveSubscription,
  AiModel,
  AuthUser,
  ConfirmSubscriptionResult,
  CreditBalance,
  LedgerEntry,
  ModelKind,
  ModelPreferences,
  Note,
  NoteGroup,
  NoteType,
  PaymentChannel,
  Profile,
  ProviderOption,
  Recording,
  Space,
  StartSubscriptionResult,
  SubscriptionPlan,
  UserKey,
} from '../domain';

/**
 * What the application needs from the outside world, stated as contracts.
 *
 * No signature here mentions the backend database or transport — no provider error, no realtime channel,
 * no FunctionsHttpError. That is the whole point: an adapter can satisfy these
 * with Postgres, with a REST backend, or with an in-memory fake in a test, and
 * nothing above the line changes.
 */

// ─── Notes ────────────────────────────────────────────────────────────────

export interface NoteMove {
  id: string;
  x: number;
  y: number;
}

export interface CreateNoteInput {
  content: string;
  type?: NoteType;
  x: number;
  y: number;
  parentId?: string | null;
}

export interface NoteRepository {
  listBySpace(spaceId: string): Promise<Note[]>;
  findById(noteId: string): Promise<Note | null>;
  create(spaceId: string, note: CreateNoteInput): Promise<Note>;
  updateContent(noteId: string, fields: { title?: string | null; content: string }): Promise<void>;
  updateColor(noteId: string, color: string): Promise<void>;
  updateType(noteId: string, type: NoteType): Promise<void>;
  updatePosition(noteId: string, x: number, y: number): Promise<void>;
  /** One round trip for many notes — a tidy of 30 must not be 30 races. */
  moveMany(moves: NoteMove[]): Promise<void>;
  /** Soft delete: the row survives for undo and provenance. */
  remove(noteId: string): Promise<void>;
  /** Re-parent a note, or detach it with null. */
  updateParent(noteId: string, parentId: string | null): Promise<void>;
}

// ─── Spaces & groups ──────────────────────────────────────────────────────

export interface MindMapEdge {
  id: string;
  from: string;
  to: string;
  type: string;
}

export interface MindMapData {
  nodes: Note[];
  edges: MindMapEdge[];
}

export interface SpaceRepository {
  list(): Promise<Space[]>;
  create(name: string, emoji?: string): Promise<Space>;
  rename(spaceId: string, name: string): Promise<void>;
  remove(spaceId: string): Promise<void>;
  getMindMap(spaceId: string): Promise<MindMapData>;
}

export interface CreateGroupInput {
  title?: string | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export type GroupPatch = Partial<Omit<NoteGroup, 'id'>>;

export interface GroupRepository {
  listBySpace(spaceId: string): Promise<NoteGroup[]>;
  create(spaceId: string, group: CreateGroupInput): Promise<NoteGroup>;
  update(groupId: string, fields: GroupPatch): Promise<void>;
  remove(groupId: string): Promise<void>;
}

// ─── Recordings ───────────────────────────────────────────────────────────

export interface RecordingRepository {
  listBySpace(spaceId: string): Promise<Recording[]>;
  create(input: { spaceId: string; durationMs: number }): Promise<string>;
  markFailed(recordingId: string, error: string): Promise<void>;
  markCompleted(recordingId: string): Promise<void>;
  findTranscriptId(recordingId: string): Promise<string | null>;
  finish(recordingId: string): Promise<void>;
  /** Current status and error, for seeding a subscription without waiting. */
  getStatus(recordingId: string): Promise<{ status: RecordingStatusValue; error: string | null } | null>;
}

export type RecordingStatusValue = Recording['status'];

// ─── Credits, models, account, keys ───────────────────────────────────────

export interface CreditRepository {
  getBalance(): Promise<CreditBalance>;
  listLedger(limit?: number, offset?: number): Promise<LedgerEntry[]>;
}

export interface ModelRepository {
  list(): Promise<AiModel[]>;
  getPreferences(): Promise<ModelPreferences>;
  setPreference(kind: ModelKind, modelRowId: string | null): Promise<void>;
}

export interface AccountRepository {
  getProfile(): Promise<Profile>;
  updateDisplayName(name: string): Promise<void>;
  /** Deletes owned content and the auth account itself. */
  deleteAccount(): Promise<void>;
}

export interface SaveKeyInput {
  provider: string;
  apiKey: string;
  label?: string;
  baseUrl?: string;
}

export interface KeyRepository {
  list(): Promise<UserKey[]>;
  save(input: SaveKeyInput): Promise<{ ok: true; keyHint: string }>;
  remove(keyId: string): Promise<void>;
}

// ─── Billing ──────────────────────────────────────────────────────────────

export interface BillingRepository {
  listPlans(): Promise<SubscriptionPlan[]>;
  getActiveSubscription(): Promise<ActiveSubscription | null>;
  listPaymentProviders(): Promise<ProviderOption[]>;
  start(planId: string, channel?: PaymentChannel): Promise<StartSubscriptionResult>;
  confirm(subscriptionId: string, receipt: unknown): Promise<ConfirmSubscriptionResult>;
}

// ─── Non-CRUD capabilities ────────────────────────────────────────────────

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

export interface AuthPort {
  getSession(): Promise<AuthSession | null>;
  /** Returns an unsubscribe function; never leaks the provider's handle. */
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /** fullName lands in the account's profile metadata when given. */
  signUp(email: string, password: string, fullName?: string): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** Token refresh is provider-specific housekeeping tied to app foreground. */
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
}

export interface StoragePort {
  /** Uploads local audio and returns the stored path. */
  uploadRecording(input: {
    localUri: string;
    userId: string;
    spaceId: string;
    recordingId: string;
  }): Promise<string>;
  /** Short-lived URL a player can stream from. */
  signedUrl(storagePath: string, expiresInSeconds?: number): Promise<string>;
}

export interface RealtimePort {
  /**
   * Watches one recording's status. Returns an unsubscribe function.
   *
   * Deliberately narrow rather than a generic "subscribe to table changes":
   * a general channel API would drag the provider's filter syntax across the
   * boundary, which is exactly what this layer exists to prevent.
   */
  watchRecording(
    recordingId: string,
    onChange: (next: { status: RecordingStatusValue; error: string | null }) => void
  ): () => void;
}

/**
 * Server-side operations that are neither CRUD nor storage — the AI pipeline.
 *
 * Implementations MUST throw an error carrying the server's machine-readable
 * code. The UI maps those codes to copy and actions ("out of credits" opens
 * the top-up sheet); an adapter that throws a plain Error silently collapses
 * every failure back into one generic message.
 */
export interface FunctionsPort {
  invoke<T>(name: string, body: Record<string, unknown>): Promise<T>;
}
