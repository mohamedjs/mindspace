import type { AiModel, ModelKind } from '../domain/entities.js';
import { NoModelAvailableError } from '../domain/errors.js';
import type { AiModelRepositoryPort } from '../domain/ports.js';

export class ResolveModelUseCase {
  constructor(private readonly modelRepo: AiModelRepositoryPort) {}

  async execute(userId: string, kind: ModelKind): Promise<AiModel> {
    // 1. User saved preference
    try {
      const preferences = await this.modelRepo.getUserModelPreferences(userId);
      const preferredId = kind === 'chat' ? preferences.chat_model_id : preferences.transcribe_model_id;

      if (preferredId) {
        const preferred = await this.modelRepo.getModelById(preferredId);
        if (preferred && preferred.kind === kind && preferred.enabled) {
          return preferred;
        }
      }
    } catch {
      // Query error on preference or model lookup is handled and falls back
    }

    // 2. For chat: stay on a provider the user holds an active key for
    if (kind === 'chat') {
      try {
        const providers = await this.modelRepo.listActiveProviderKeys(userId);
        if (providers.length > 0) {
          const onOwnKey = await this.modelRepo.findEnabledModelForProviders(kind, providers);
          if (onOwnKey) {
            return onOwnKey;
          }
        }
      } catch {
        // Query error handled, fall back to default
      }
    }

    // 3. Fallback to default enabled model for this kind
    try {
      const defaultModel = await this.modelRepo.getDefaultModel(kind);
      if (defaultModel && defaultModel.enabled) {
        return defaultModel;
      }
    } catch {
      // Query error handled
    }

    // 4. Any enabled model for this kind
    try {
      const all = await this.modelRepo.listModels();
      const firstEnabled = all.find((m) => m.kind === kind && m.enabled);
      if (firstEnabled) {
        return firstEnabled;
      }
    } catch {
      // Handled
    }

    throw new NoModelAvailableError(`no default ${kind} model configured`);
  }
}
