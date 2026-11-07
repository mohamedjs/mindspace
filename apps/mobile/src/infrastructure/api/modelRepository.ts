import type { AiModel, ModelKind, ModelPreferences } from '../../core/domain';
import type { ModelRepository } from '../../core/ports';
import { apiFetch } from './client';
import { toAiModel } from './mappers';

export const apiModelRepository: ModelRepository = {
  async list(): Promise<AiModel[]> {
    const data = await apiFetch<Record<string, unknown>[]>('/models');
    return (data ?? []).map(toAiModel);
  },

  async getPreferences(): Promise<ModelPreferences> {
    try {
      const data = await apiFetch<{
        chat_model_id?: string | null;
        transcribe_model_id?: string | null;
        chatModelId?: string | null;
        transcribeModelId?: string | null;
      }>('/models/preferences');
      return {
        chatModelId: data?.chat_model_id ?? data?.chatModelId ?? null,
        transcribeModelId: data?.transcribe_model_id ?? data?.transcribeModelId ?? null,
      };
    } catch {
      return { chatModelId: null, transcribeModelId: null };
    }
  },

  async setPreference(kind: ModelKind, modelRowId: string | null): Promise<void> {
    await apiFetch('/models/preferences', {
      method: 'PATCH',
      body: JSON.stringify({
        kind,
        model_row_id: modelRowId,
      }),
    });
  },
};
