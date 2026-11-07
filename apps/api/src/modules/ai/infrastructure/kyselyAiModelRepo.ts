import type { Database } from '../../../platform/db.js';
import type { AiModel, ModelKind, ModelPreferences } from '../domain/entities.js';
import type { AiModelRepositoryPort } from '../domain/ports.js';

export class KyselyAiModelRepository implements AiModelRepositoryPort {
  constructor(private readonly db: Database) {}

  async listModels(): Promise<AiModel[]> {
    const rows = await this.db
      .selectFrom('ai_models')
      .selectAll()
      .where('enabled', '=', true)
      .orderBy('kind', 'asc')
      .orderBy('sort_order', 'asc')
      .execute();

    return rows.map(this.toEntity);
  }

  async getModelById(id: string): Promise<AiModel | null> {
    const row = await this.db
      .selectFrom('ai_models')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? this.toEntity(row) : null;
  }

  async getDefaultModel(kind: ModelKind): Promise<AiModel | null> {
    const row = await this.db
      .selectFrom('ai_models')
      .selectAll()
      .where('kind', '=', kind)
      .where('is_default', '=', true)
      .where('enabled', '=', true)
      .executeTakeFirst();

    return row ? this.toEntity(row) : null;
  }

  async findEnabledModelForProviders(kind: ModelKind, providers: string[]): Promise<AiModel | null> {
    if (providers.length === 0) return null;

    const row = await this.db
      .selectFrom('ai_models')
      .selectAll()
      .where('kind', '=', kind)
      .where('enabled', '=', true)
      .where('provider', 'in', providers)
      .orderBy('sort_order', 'asc')
      .limit(1)
      .executeTakeFirst();

    return row ? this.toEntity(row) : null;
  }

  async getUserModelPreferences(userId: string): Promise<ModelPreferences> {
    const row = await this.db
      .selectFrom('profiles')
      .select(['chat_model_id', 'transcribe_model_id'])
      .where('id', '=', userId)
      .executeTakeFirst();

    return {
      chat_model_id: row?.chat_model_id ?? null,
      transcribe_model_id: row?.transcribe_model_id ?? null,
    };
  }

  async updateUserModelPreference(
    userId: string,
    kind: ModelKind,
    modelRowId: string | null
  ): Promise<void> {
    const column = kind === 'chat' ? 'chat_model_id' : 'transcribe_model_id';
    await this.db
      .updateTable('profiles')
      .set({ [column]: modelRowId })
      .where('id', '=', userId)
      .execute();
  }

  async listActiveProviderKeys(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('user_ai_keys')
      .select('provider')
      .distinct()
      .where('user_id', '=', userId)
      .where('is_active', '=', true)
      .execute();

    return rows.map((r) => r.provider);
  }

  private toEntity(row: any): AiModel {
    return {
      id: row.id,
      provider: row.provider,
      model_id: row.model_id,
      display_name: row.display_name,
      kind: row.kind,
      input_price_m: row.input_price_m !== null ? Number(row.input_price_m) : null,
      output_price_m: row.output_price_m !== null ? Number(row.output_price_m) : null,
      price_per_min: row.price_per_min !== null ? Number(row.price_per_min) : null,
      credit_multiplier: Number(row.credit_multiplier ?? 1),
      tier: row.tier ?? 'free',
      enabled: Boolean(row.enabled),
      notes: row.notes ?? null,
      sort_order: Number(row.sort_order ?? 100),
      price_synced_at: row.price_synced_at ? new Date(row.price_synced_at) : null,
      is_default: Boolean(row.is_default),
    };
  }
}
