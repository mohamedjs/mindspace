import type { ProviderSummary } from '../domain/entities.js';
import type { PaymentProviderRegistryPort } from '../domain/ports.js';

export class ListProvidersUseCase {
  constructor(private readonly registry: PaymentProviderRegistryPort) {}

  execute(): { providers: ProviderSummary[] } {
    return { providers: this.registry.listProviders() };
  }
}
