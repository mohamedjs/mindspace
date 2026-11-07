import type { CreditPackage } from '../domain/entities.js';
import type { CreditRepositoryPort } from '../domain/ports.js';

export class ListPackagesUseCase {
  constructor(private readonly creditRepo: CreditRepositoryPort) {}

  async execute(): Promise<CreditPackage[]> {
    return this.creditRepo.listEnabledPackages();
  }
}
