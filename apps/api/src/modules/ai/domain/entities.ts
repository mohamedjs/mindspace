export type ModelKind = 'chat' | 'transcribe';

export interface AiModel {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  kind: ModelKind;
  input_price_m: number | null;
  output_price_m: number | null;
  price_per_min: number | null;
  credit_multiplier: number;
  tier: string;
  enabled: boolean;
  notes: string | null;
  sort_order: number;
  price_synced_at: Date | null;
  is_default: boolean;
}

export type AiActionKind =
  | 'extract_thoughts'
  | 'detect_relations'
  | 'thought_evolution'
  | 'weekly_digest';

export type AiActionStatus =
  | 'pending'
  | 'proposed'
  | 'accepted'
  | 'partially_accepted'
  | 'rejected'
  | 'undone'
  | 'failed';

export interface AiAction {
  id: string;
  userId: string;
  spaceId: string;
  kind: AiActionKind;
  status: AiActionStatus;
  recordingId: string | null;
  transcriptId: string | null;
  provider: string;
  modelId: string;
  promptVersion: string;
  billedTo: 'credits' | 'byok';
  creditsCharged: number;
  inputTokens: number | null;
  outputTokens: number | null;
  rawCostUsd: number | null;
  rawResponse: Record<string, unknown> | null;
  error: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface AiActionItem {
  id: string;
  userId: string;
  aiActionId: string;
  operation: string;
  targetType: string;
  targetId: string | null;
  forwardPatch: Record<string, unknown>;
  inversePatch: Record<string, unknown>;
  accepted: boolean;
  appliedAt: Date | null;
  sortOrder: number;
}

export interface ModelPreferences {
  chat_model_id: string | null;
  transcribe_model_id: string | null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PromptClock {
  today: string;
  weekday: string;
  timezone: string;
}

export interface ExistingNoteContext {
  id: string;
  title: string | null;
  content: string;
  type: string;
  updatedAt?: Date;
  parentId?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ExtractedNote {
  clientKey: string;
  title?: string | null;
  content: string;
  type: string;
  parentClientKey?: string | null;
  dueAt?: string | null;
  spanStart?: number | null;
  spanEnd?: number | null;
  color?: string | null;
}

export interface ExtractedRelation {
  from: string;
  to: string;
  type: string;
}

export interface Extraction {
  notes: ExtractedNote[];
  relations: ExtractedRelation[];
}

export interface WrittenNote {
  title: string | null;
  content: string;
  dueAt: string | null;
}

export interface ChatArgs {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  jsonMode?: boolean;
  timeoutMs?: number;
}

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractionHandoffInput {
  recordingId: string;
  userId: string;
  spaceId: string;
  transcriptId: string;
  transcriptText: string;
  kind: 'note' | 'meeting';
  processMode: string | null;
  targetNoteId: string | null;
  parentNoteId: string | null;
}
