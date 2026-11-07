import type { ModelPreferences } from '../domain/entities.js';
import type { AiModelRepositoryPort } from '../domain/ports.js';

export class GetModelPreferencesUseCase {
  constructor(private readonly modelRepo: AiModelRepositoryPort) {}

  async execute(userId: string): Promise<ModelPreferences> {
    return this.modelRepo.getUserModelPreferences(userId);
  }
}
