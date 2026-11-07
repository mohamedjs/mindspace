import type { Database } from '../../../platform/db.js';
import type { AiAction, AiActionItem, AiActionStatus } from '../domain/entities.js';
import type { AiActionRepositoryPort } from '../domain/ports.js';

export class KyselyAiActionRepository implements AiActionRepositoryPort {
  constructor(private readonly db: Database) {}

  private getClient(tx?: unknown): Database {
    return (tx as Database) ?? this.db;
  }

  async findActionById(actionId: string, userId: string): Promise<AiAction | null> {
    const row = await this.db
      .selectFrom('ai_actions')
      .selectAll()
      .where('id', '=', actionId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return row ? this.toActionEntity(row) : null;
  }

  async findActionByRecording(recordingId: string, userId: string): Promise<AiAction | null> {
    const row = await this.db
      .selectFrom('ai_actions')
      .selectAll()
      .where('recording_id', '=', recordingId)
      .where('user_id', '=', userId)
      .where('status', 'in', ['proposed', 'accepted'])
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    return row ? this.toActionEntity(row) : null;
  }

  async createAction(
    action: Omit<AiAction, 'id' | 'createdAt' | 'resolvedAt'>,
    tx?: unknown
  ): Promise<string> {
    const client = this.getClient(tx);
    const row = await client
      .insertInto('ai_actions')
      .values({
        user_id: action.userId,
        space_id: action.spaceId,
        kind: action.kind,
        status: action.status,
        recording_id: action.recordingId,
        transcript_id: action.transcriptId,
        provider: action.provider,
        model_id: action.modelId,
        prompt_version: action.promptVersion,
        billed_to: action.billedTo,
        credits_charged: action.creditsCharged,
        input_tokens: action.inputTokens,
        output_tokens: action.outputTokens,
        raw_cost_usd: action.rawCostUsd,
        raw_response: action.rawResponse ? JSON.stringify(action.rawResponse) : null,
        error: action.error,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return String(row.id);
  }

  async updateActionStatus(
    actionId: string,
    status: AiActionStatus,
    resolvedAt?: Date | null,
    tx?: unknown
  ): Promise<void> {
    const client = this.getClient(tx);
    await client
      .updateTable('ai_actions')
      .set({
        status,
        resolved_at: resolvedAt ? resolvedAt.toISOString() : null,
      })
      .where('id', '=', actionId)
      .execute();
  }

  async createActionItems(items: Array<Omit<AiActionItem, 'id'>>, tx?: unknown): Promise<void> {
    if (items.length === 0) return;
    const client = this.getClient(tx);

    await client
      .insertInto('ai_action_items')
      .values(
        items.map((item) => ({
          user_id: item.userId,
          ai_action_id: item.aiActionId,
          operation: item.operation,
          target_type: item.targetType,
          target_id: item.targetId,
          forward_patch: JSON.stringify(item.forwardPatch),
          inverse_patch: JSON.stringify(item.inversePatch),
          accepted: item.accepted,
          applied_at: item.appliedAt ? item.appliedAt.toISOString() : null,
          sort_order: item.sortOrder,
        }))
      )
      .execute();
  }

  async listActionItems(actionId: string, tx?: unknown): Promise<AiActionItem[]> {
    const client = this.getClient(tx);
    const rows = await client
      .selectFrom('ai_action_items')
      .selectAll()
      .where('ai_action_id', '=', actionId)
      .orderBy('sort_order', 'asc')
      .execute();

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      aiActionId: r.ai_action_id,
      operation: r.operation,
      targetType: r.target_type,
      targetId: r.target_id,
      forwardPatch: typeof r.forward_patch === 'string' ? JSON.parse(r.forward_patch) : (r.forward_patch ?? {}),
      inversePatch: typeof r.inverse_patch === 'string' ? JSON.parse(r.inverse_patch) : (r.inverse_patch ?? {}),
      accepted: Boolean(r.accepted),
      appliedAt: r.applied_at ? new Date(r.applied_at) : null,
      sortOrder: Number(r.sort_order ?? 0),
    }));
  }

  async updateActionItemApplied(itemId: string, appliedAt: Date | null, tx?: unknown): Promise<void> {
    const client = this.getClient(tx);
    await client
      .updateTable('ai_action_items')
      .set({
        applied_at: appliedAt ? appliedAt.toISOString() : null,
      })
      .where('id', '=', itemId)
      .execute();
  }

  private toActionEntity(row: any): AiAction {
    return {
      id: row.id,
      userId: row.user_id,
      spaceId: row.space_id,
      kind: row.kind,
      status: row.status,
      recordingId: row.recording_id ?? null,
      transcriptId: row.transcript_id ?? null,
      provider: row.provider,
      modelId: row.model_id,
      promptVersion: row.prompt_version,
      billedTo: row.billed_to ?? 'credits',
      creditsCharged: Number(row.credits_charged ?? 0),
      inputTokens: row.input_tokens !== null ? Number(row.input_tokens) : null,
      outputTokens: row.output_tokens !== null ? Number(row.output_tokens) : null,
      rawCostUsd: row.raw_cost_usd !== null ? Number(row.raw_cost_usd) : null,
      rawResponse: typeof row.raw_response === 'string' ? JSON.parse(row.raw_response) : row.raw_response ?? null,
      error: row.error ?? null,
      createdAt: new Date(row.created_at),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    };
  }
}
