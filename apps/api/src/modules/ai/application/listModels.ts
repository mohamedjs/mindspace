import type { AiModel } from '../domain/entities.js';
import type { AiModelRepositoryPort } from '../domain/ports.js';

export class ListModelsUseCase {
  constructor(private readonly modelRepo: AiModelRepositoryPort) {}

  async execute(): Promise<AiModel[]> {
    return this.modelRepo.listModels();
  }
}
