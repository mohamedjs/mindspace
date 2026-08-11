import type { AiModel, ModelKind, ModelPreferences } from '../../../core/domain';
import { supabaseContainer } from '../../../infrastructure/container';

export type { AiModel, ModelKind, ModelPreferences };

export const fetchModels = () => supabaseContainer.models.list();
export const fetchModelPreferences = () => supabaseContainer.models.getPreferences();
export const setModelPreference = (kind: ModelKind, modelRowId: string | null) =>
  supabaseContainer.models.setPreference(kind, modelRowId);
