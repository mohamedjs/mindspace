import type { Database } from '../../../platform/db.js';
import type { UnitOfWorkPort } from '../domain/ports.js';

export class KyselyUnitOfWork implements UnitOfWorkPort {
  constructor(private db: Database) {}

  async transaction<T>(work: (trx: unknown) => Promise<T>): Promise<T> {
    return await this.db.transaction().execute(async (trx) => {
      return await work(trx);
    });
  }
}
