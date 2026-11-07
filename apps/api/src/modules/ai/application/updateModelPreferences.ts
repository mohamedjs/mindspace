import type { ModelKind } from '../domain/entities.js';
import { ModelNotFoundError } from '../domain/errors.js';
import type { AiModelRepositoryPort } from '../domain/ports.js';

export class UpdateModelPreferencesUseCase {
  constructor(private readonly modelRepo: AiModelRepositoryPort) {}

  async execute(userId: string, kind: ModelKind, modelRowId: string | null): Promise<void> {
    if (modelRowId) {
      const model = await this.modelRepo.getModelById(modelRowId);
      if (!model || model.kind !== kind || !model.enabled) {
        throw new ModelNotFoundError(`Model ${modelRowId} not found or invalid for kind ${kind}`);
      }
    }

    await this.modelRepo.updateUserModelPreference(userId, kind, modelRowId);
  }
}
