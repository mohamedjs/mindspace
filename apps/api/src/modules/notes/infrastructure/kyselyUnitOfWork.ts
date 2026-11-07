import type { Database } from '../../../platform/db.js';
import type { UnitOfWorkPort } from '../domain/ports.js';

export class KyselyUnitOfWork implements UnitOfWorkPort {
  constructor(private db: Database) {}

  async runInTransaction<T>(work: (trx: unknown) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      return work(trx);
    });
  }
}
