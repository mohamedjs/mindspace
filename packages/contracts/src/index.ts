import * as yup from 'yup';

export const healthResponseSchema = yup.object({
  status: yup.string().required(),
  postgres: yup.string().optional(),
  redis: yup.string().optional(),
});

export type HealthResponse = yup.InferType<typeof healthResponseSchema>;

export const errorResponseSchema = yup.object({
  error: yup.string().required(),
  message: yup.string().required(),
});

export type ErrorResponse = yup.InferType<typeof errorResponseSchema>;

// Auth & Account Schemas

export const signUpRequestSchema = yup.object({
  email: yup.string().email('Invalid email address').required('Email is required'),
  password: yup.string().required('Password is required'),
  full_name: yup.string().optional().nullable(),
});

export type SignUpRequest = yup.InferType<typeof signUpRequestSchema>;

export const signInRequestSchema = yup.object({
  email: yup.string().email('Invalid email address').required('Email is required'),
  password: yup.string().required('Password is required'),
});

export type SignInRequest = yup.InferType<typeof signInRequestSchema>;

export const refreshTokenRequestSchema = yup.object({
  refresh_token: yup.string().optional(),
});

export type RefreshTokenRequest = yup.InferType<typeof refreshTokenRequestSchema>;

export const resetPasswordRequestSchema = yup.object({
  email: yup.string().email('Invalid email address').required('Email is required'),
});

export type ResetPasswordRequest = yup.InferType<typeof resetPasswordRequestSchema>;

export const confirmPasswordResetRequestSchema = yup.object({
  token: yup.string().required('Token is required'),
  password: yup.string().required('Password is required'),
});

export type ConfirmPasswordResetRequest = yup.InferType<typeof confirmPasswordResetRequestSchema>;

export const updateProfileRequestSchema = yup.object({
  display_name: yup.string().required('display_name is required'),
});

export type UpdateProfileRequest = yup.InferType<typeof updateProfileRequestSchema>;

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
  };
}

export interface AuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface ProfileResponse {
  display_name: string | null;
  email: string;
}

// ============================================================
// Core Module Enums and Types
// ============================================================

export const NOTE_TYPES = [
  'idea',
  'task',
  'question',
  'decision',
  'reference',
  'thought',
  'summary',
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export const REL_TYPES = [
  'related',
  'depends_on',
  'supports',
  'contradicts',
  'derived_from',
  'child_of',
] as const;

export type RelType = (typeof REL_TYPES)[number];

export const SOURCE_TYPES = ['voice', 'manual', 'ai'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// ============================================================
// Spaces Contracts
// ============================================================

export const spaceOutSchema = yup.object({
  id: yup.string().required(),
  name: yup.string().required(),
  emoji: yup.string().required(),
  note_count: yup.number().required(),
  last_activity_at: yup.string().required(),
});

export type SpaceOut = yup.InferType<typeof spaceOutSchema>;

export const createSpaceRequestSchema = yup.object({
  name: yup.string().trim().required('name is required'),
  emoji: yup.string().optional().default('💡'),
});

export type CreateSpaceRequest = yup.InferType<typeof createSpaceRequestSchema>;

export const updateSpaceRequestSchema = yup.object({
  name: yup.string().trim().required('name is required'),
});

export type UpdateSpaceRequest = yup.InferType<typeof updateSpaceRequestSchema>;

// ============================================================
// Notes Contracts
// ============================================================

export const noteOutSchema = yup.object({
  id: yup.string().required(),
  title: yup.string().nullable().defined(),
  content: yup.string().required(),
  type: yup.mixed<NoteType>().oneOf([...NOTE_TYPES]).required(),
  color: yup.string().nullable().defined(),
  x: yup.number().required(),
  y: yup.number().required(),
  width: yup.number().required(),
  height: yup.number().required(),
  parent_id: yup.string().nullable().defined(),
  space_id: yup.string().required(),
  due_at: yup.string().nullable().defined(),
  created_at: yup.string().required(),
});

export type NoteOut = yup.InferType<typeof noteOutSchema>;

export const createNoteRequestSchema = yup.object({
  content: yup.string().required('content is required'),
  type: yup.mixed<NoteType>().oneOf([...NOTE_TYPES]).optional().default('idea'),
  x: yup.number().required('x is required'),
  y: yup.number().required('y is required'),
  parent_id: yup.string().nullable().optional(),
  title: yup.string().nullable().optional(),
  color: yup.string().nullable().optional(),
  width: yup.number().optional(),
  height: yup.number().optional(),
  due_at: yup.string().nullable().optional(),
});

export type CreateNoteRequest = yup.InferType<typeof createNoteRequestSchema>;

export const updateNoteContentRequestSchema = yup.object({
  title: yup.string().nullable().optional(),
  content: yup.string().required('content is required'),
});

export type UpdateNoteContentRequest = yup.InferType<typeof updateNoteContentRequestSchema>;

export const updateNoteColorRequestSchema = yup.object({
  color: yup.string().nullable().required('color is required'),
});

export type UpdateNoteColorRequest = yup.InferType<typeof updateNoteColorRequestSchema>;

export const updateNoteTypeRequestSchema = yup.object({
  type: yup.mixed<NoteType>().oneOf([...NOTE_TYPES]).required('type is required'),
});

export type UpdateNoteTypeRequest = yup.InferType<typeof updateNoteTypeRequestSchema>;

export const updateNotePositionRequestSchema = yup.object({
  x: yup.number().required('x is required'),
  y: yup.number().required('y is required'),
});

export type UpdateNotePositionRequest = yup.InferType<typeof updateNotePositionRequestSchema>;

export const updateNoteParentRequestSchema = yup.object({
  parent_id: yup.string().nullable().defined(),
});

export type UpdateNoteParentRequest = yup.InferType<typeof updateNoteParentRequestSchema>;

export const bulkMoveItemSchema = yup.object({
  id: yup.string().required('id is required'),
  x: yup.number().required('x is required'),
  y: yup.number().required('y is required'),
});

export const bulkMoveNotesRequestSchema = yup.object({
  moves: yup
    .array()
    .of(bulkMoveItemSchema)
    .max(500, 'Cannot move more than 500 notes at once')
    .required('moves array is required'),
});

export type BulkMoveNotesRequest = yup.InferType<typeof bulkMoveNotesRequestSchema>;

export const bulkUpdateNotesRequestSchema = yup.object({
  ids: yup
    .array()
    .of(yup.string().required())
    .min(1, 'At least one note id is required')
    .max(500, 'Cannot update more than 500 notes at once')
    .required('ids is required'),
  color: yup.string().nullable().optional(),
  type: yup.mixed<NoteType>().oneOf([...NOTE_TYPES]).optional(),
});

export type BulkUpdateNotesRequest = yup.InferType<typeof bulkUpdateNotesRequestSchema>;

export const bulkDeleteNotesRequestSchema = yup.object({
  ids: yup
    .array()
    .of(yup.string().required())
    .min(1, 'At least one note id is required')
    .max(500, 'Cannot delete more than 500 notes at once')
    .required('ids is required'),
});

export type BulkDeleteNotesRequest = yup.InferType<typeof bulkDeleteNotesRequestSchema>;

export const bulkRestoreNotesRequestSchema = yup.object({
  ids: yup
    .array()
    .of(yup.string().required())
    .min(1, 'At least one note id is required')
    .max(500, 'Cannot restore more than 500 notes at once')
    .required('ids is required'),
});

export type BulkRestoreNotesRequest = yup.InferType<typeof bulkRestoreNotesRequestSchema>;

export const bulkCreateNoteItemSchema = yup.object({
  id: yup.string().optional(),
  space_id: yup.string().required('space_id is required'),
  content: yup.string().required('content is required'),
  title: yup.string().nullable().optional(),
  type: yup.mixed<NoteType>().oneOf([...NOTE_TYPES]).optional().default('idea'),
  color: yup.string().nullable().optional(),
  x: yup.number().required('x is required'),
  y: yup.number().required('y is required'),
  width: yup.number().optional(),
  height: yup.number().optional(),
  parent_id: yup.string().nullable().optional(),
  due_at: yup.string().nullable().optional(),
});

export const bulkCreateRelationItemSchema = yup.object({
  space_id: yup.string().optional(),
  from_note_id: yup.string().required('from_note_id is required'),
  to_note_id: yup.string().required('to_note_id is required'),
  type: yup.mixed<RelType>().oneOf([...REL_TYPES]).optional().default('related'),
});

export const bulkCreateNotesRequestSchema = yup.object({
  notes: yup
    .array()
    .of(bulkCreateNoteItemSchema)
    .min(1, 'At least one note is required')
    .max(500, 'Cannot create more than 500 notes at once')
    .required('notes is required'),
  relations: yup.array().of(bulkCreateRelationItemSchema).optional().default([]),
});

export type BulkCreateNotesRequest = yup.InferType<typeof bulkCreateNotesRequestSchema>;

// ============================================================
// Groups Contracts
// ============================================================

export const groupOutSchema = yup.object({
  id: yup.string().required(),
  title: yup.string().nullable().defined(),
  x: yup.number().required(),
  y: yup.number().required(),
  width: yup.number().required(),
  height: yup.number().required(),
  color: yup.string().nullable().defined(),
});

export type GroupOut = yup.InferType<typeof groupOutSchema>;

export const createGroupRequestSchema = yup.object({
  title: yup.string().nullable().optional(),
  x: yup.number().required('x is required'),
  y: yup.number().required('y is required'),
  width: yup.number().optional().default(460),
  height: yup.number().optional().default(360),
  color: yup.string().nullable().optional(),
});

export type CreateGroupRequest = yup.InferType<typeof createGroupRequestSchema>;

export const updateGroupRequestSchema = yup.object({
  title: yup.string().nullable().optional(),
  x: yup.number().optional(),
  y: yup.number().optional(),
  width: yup.number().optional(),
  height: yup.number().optional(),
  color: yup.string().nullable().optional(),
});

export type UpdateGroupRequest = yup.InferType<typeof updateGroupRequestSchema>;

// ============================================================
// Relationships Contracts
// ============================================================

export const relationshipOutSchema = yup.object({
  id: yup.string().required(),
  from_note_id: yup.string().required(),
  to_note_id: yup.string().required(),
  type: yup.mixed<RelType>().oneOf([...REL_TYPES]).required(),
  created_by: yup.string().required(),
  created_at: yup.string().required(),
});

export type RelationshipOut = yup.InferType<typeof relationshipOutSchema>;

export const createRelationshipRequestSchema = yup.object({
  space_id: yup.string().required('space_id is required'),
  from_note_id: yup.string().required('from_note_id is required'),
  to_note_id: yup.string().required('to_note_id is required'),
  type: yup.mixed<RelType>().oneOf([...REL_TYPES]).optional().default('related'),
});

export type CreateRelationshipRequest = yup.InferType<typeof createRelationshipRequestSchema>;

export const deleteRelationshipRequestSchema = yup.object({
  space_id: yup.string().required('space_id is required'),
  from_note_id: yup.string().required('from_note_id is required'),
  to_note_id: yup.string().required('to_note_id is required'),
  type: yup.mixed<RelType>().oneOf([...REL_TYPES]).nullable().optional(),
});

export type DeleteRelationshipRequest = yup.InferType<typeof deleteRelationshipRequestSchema>;

// ============================================================
// Timeline Contracts
// ============================================================

export const timelineEventOutSchema = yup.object({
  id: yup.string().required(),
  type: yup.string().required(),
  ref_id: yup.string().nullable().defined(),
  summary: yup.string().required(),
  created_at: yup.string().required(),
});

export type TimelineEventOut = yup.InferType<typeof timelineEventOutSchema>;

// ============================================================
// Mind Map Contracts
// ============================================================

export const mindMapEdgeSchema = yup.object({
  id: yup.string().required(),
  from: yup.string().required(),
  to: yup.string().required(),
  from_note_id: yup.string().optional(),
  to_note_id: yup.string().optional(),
  type: yup.string().required(),
});

export type MindMapEdge = yup.InferType<typeof mindMapEdgeSchema>;

export const mindMapResponseSchema = yup.object({
  nodes: yup.array().of(noteOutSchema).required(),
  edges: yup.array().of(mindMapEdgeSchema).required(),
});

export type MindMapResponse = yup.InferType<typeof mindMapResponseSchema>;

// ============================================================
// Agent Ingest Contracts
// ============================================================

export const ingestNoteInputSchema = yup.object({
  client_key: yup.string().optional(),
  clientKey: yup.string().optional(),
  title: yup.string().max(80).nullable().optional(),
  content: yup.string().required('content is required'),
  type: yup.mixed<NoteType>().oneOf([...NOTE_TYPES]).optional().default('idea'),
  color: yup.string().nullable().optional(),
  parent_key: yup.string().nullable().optional(),
  parentKey: yup.string().nullable().optional(),
  due_at: yup.string().nullable().optional(),
  dueAt: yup.string().nullable().optional(),
});

export type IngestNoteInput = yup.InferType<typeof ingestNoteInputSchema>;

export const ingestRelationInputSchema = yup.object({
  from: yup.string().required('from is required'),
  to: yup.string().required('to is required'),
  type: yup.mixed<RelType>().oneOf([...REL_TYPES]).optional().default('related'),
});

export type IngestRelationInput = yup.InferType<typeof ingestRelationInputSchema>;

export const ingestGroupInputSchema = yup.object({
  title: yup.string().required('title is required'),
  color: yup.string().nullable().optional(),
  member_keys: yup.array().of(yup.string().required()).optional(),
  memberKeys: yup.array().of(yup.string().required()).optional(),
});

export type IngestGroupInput = yup.InferType<typeof ingestGroupInputSchema>;

export const ingestRequestSchema = yup.object({
  notes: yup
    .array()
    .of(ingestNoteInputSchema)
    .min(1, 'At least 1 note is required')
    .max(200, 'Maximum 200 notes per ingest')
    .required('notes is required'),
  relations: yup.array().of(ingestRelationInputSchema).optional().default([]),
  groups: yup.array().of(ingestGroupInputSchema).optional().default([]),
});

export type IngestRequest = yup.InferType<typeof ingestRequestSchema>;

export const ingestResponseSchema = yup.object({
  notes: yup
    .array()
    .of(
      yup.object({
        client_key: yup.string().required(),
        id: yup.string().required(),
      })
    )
    .required(),
  relations: yup.number().required(),
  groups: yup.array().of(groupOutSchema).required(),
});

export type IngestResponse = yup.InferType<typeof ingestResponseSchema>;

// ============================================================
// Credits Contracts
// ============================================================

export const LEDGER_REASONS = [
  'signup_grant',
  'monthly_refill',
  'purchase',
  'usage',
  'refund',
  'reversal',
  'admin_adjust',
] as const;

export type LedgerReason = (typeof LEDGER_REASONS)[number];

export const creditBalanceOutSchema = yup.object({
  credits_balance: yup.number().integer().required(),
  credits_reserved: yup.number().integer().required(),
});

export type CreditBalanceOut = yup.InferType<typeof creditBalanceOutSchema>;

export const creditLedgerOutSchema = yup.object({
  id: yup.number().integer().required(),
  delta: yup.number().integer().required(),
  balance_after: yup.number().integer().required(),
  reason: yup.mixed<LedgerReason>().oneOf([...LEDGER_REASONS]).required(),
  created_at: yup.string().required(),
});

export type CreditLedgerOut = yup.InferType<typeof creditLedgerOutSchema>;

export const creditPackageOutSchema = yup.object({
  id: yup.string().required(),
  name: yup.string().required(),
  price_egp: yup.number().integer().required(),
  base_credits: yup.number().integer().required(),
  bonus_pct: yup.number().integer().required(),
  total_credits: yup.number().integer().required(),
  is_featured: yup.boolean().required(),
  store_product_id_ios: yup.string().nullable().defined(),
  store_product_id_android: yup.string().nullable().defined(),
  sort_order: yup.number().integer().required(),
});

export type CreditPackageOut = yup.InferType<typeof creditPackageOutSchema>;

// ============================================================
// BYOK Keys Contracts
// ============================================================

export const BYOK_PROVIDERS = ['openai', 'anthropic', 'google'] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

export const PROVIDER_IDS = [
  'openrouter',
  'openai',
  'google',
  'anthropic',
  'nvidia',
  'custom',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const userKeyOutSchema = yup.object({
  id: yup.string().required(),
  provider: yup.string().required(),
  label: yup.string().nullable().defined(),
  key_hint: yup.string().required(),
  is_active: yup.boolean().required(),
  last_error: yup.string().nullable().defined(),
  created_at: yup.string().required(),
});

export type UserKeyOut = yup.InferType<typeof userKeyOutSchema>;

export const saveKeyRequestSchema = yup.object({
  provider: yup.mixed<ByokProvider>().oneOf([...BYOK_PROVIDERS]).required('provider is required'),
  apiKey: yup.string().min(8, 'API key must be at least 8 characters').required('apiKey is required'),
  label: yup.string().nullable().optional(),
});

export type SaveKeyRequest = yup.InferType<typeof saveKeyRequestSchema>;

export const saveKeyResponseSchema = yup.object({
  ok: yup.boolean().oneOf([true]).required(),
  keyHint: yup.string().required(),
});

export type SaveKeyResponse = yup.InferType<typeof saveKeyResponseSchema>;

// ============================================================
// Recordings Contracts
// ============================================================

export const RECORDING_STATUSES = [
  'recorded',
  'uploading',
  'queued',
  'splitting',
  'transcribing',
  'transcribed',
  'extracting',
  'completed',
  'failed',
] as const;

export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

export const RECORDING_KINDS = ['note', 'meeting'] as const;
export type RecordingKind = (typeof RECORDING_KINDS)[number];

export const ALLOWED_AUDIO_EXTENSIONS = ['webm', 'm4a', 'mp4', 'mp3', 'wav', 'ogg'] as const;
export type AllowedAudioExtension = (typeof ALLOWED_AUDIO_EXTENSIONS)[number];

export const createRecordingRequestSchema = yup.object({
  kind: yup
    .mixed<RecordingKind>()
    .oneOf([...RECORDING_KINDS])
    .optional()
    .default('note'),
  process_mode: yup.string().nullable().optional().default('extract'),
  processMode: yup.string().nullable().optional(),
  target_note_id: yup.string().nullable().optional(),
  targetNoteId: yup.string().nullable().optional(),
  parent_note_id: yup.string().nullable().optional(),
  parentNoteId: yup.string().nullable().optional(),
  duration_ms: yup.number().integer().min(0).optional(),
});

export type CreateRecordingRequest = yup.InferType<typeof createRecordingRequestSchema>;

export const markRecordingFailedRequestSchema = yup.object({
  error: yup.string().required('error is required'),
});

export type MarkRecordingFailedRequest = yup.InferType<typeof markRecordingFailedRequestSchema>;

export const recordingStatusOutSchema = yup.object({
  status: yup.mixed<RecordingStatus>().oneOf([...RECORDING_STATUSES]).required(),
  error: yup.string().nullable().defined(),
});

export type RecordingStatusOut = yup.InferType<typeof recordingStatusOutSchema>;

export const recordingTranscriptIdOutSchema = yup.object({
  transcript_id: yup.string().nullable().defined(),
});

export type RecordingTranscriptIdOut = yup.InferType<typeof recordingTranscriptIdOutSchema>;

export const recordingOutSchema = yup.object({
  id: yup.string().required(),
  status: yup.mixed<RecordingStatus>().oneOf([...RECORDING_STATUSES]).required(),
  error: yup.string().nullable().defined(),
  duration_ms: yup.number().integer().required(),
  created_at: yup.string().required(),
  storage_path: yup.string().nullable().defined(),
  transcripts: yup
    .array()
    .of(
      yup.object({
        text: yup.string().required(),
      })
    )
    .required(),
  sticky_notes: yup
    .array()
    .of(
      yup.object({
        id: yup.string().required(),
        title: yup.string().nullable().defined(),
        content: yup.string().required(),
        type: yup.string().required(),
        color: yup.string().nullable().defined(),
        deleted_at: yup.string().nullable().defined(),
      })
    )
    .required(),
});

export type RecordingOut = yup.InferType<typeof recordingOutSchema>;


