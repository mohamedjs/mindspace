import type { AiModel, ModelKind, ModelPreferences } from '../../../core/domain';
import { container } from '../../../infrastructure/container';

export type { AiModel, ModelKind, ModelPreferences };

export const fetchModels = () => container.models.list();
export const fetchModelPreferences = () => container.models.getPreferences();
export const setModelPreference = (kind: ModelKind, modelRowId: string | null) =>
  container.models.setPreference(kind, modelRowId);

