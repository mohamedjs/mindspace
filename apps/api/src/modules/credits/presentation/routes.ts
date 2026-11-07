import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { currentUserId, requireUser, type RequireUserHook } from '../../../platform/http/auth.js';
import { AppError } from '../../../platform/http/errors.js';
import { ProfileNotFoundError } from '../domain/errors.js';
import type { GetBalanceUseCase } from '../application/getBalance.js';
import type { ListLedgerUseCase } from '../application/listLedger.js';
import type { ListPackagesUseCase } from '../application/listPackages.js';

export interface CreditRoutesDependencies {
  requireUser?: RequireUserHook;
  getBalanceUseCase: GetBalanceUseCase;
  listLedgerUseCase: ListLedgerUseCase;
  listPackagesUseCase: ListPackagesUseCase;
}

/**
 * Read-only routes for credits.
 * CreditService write operations (reserve, settle, release, grant, refill, sweep)
 * are strictly internal and have no HTTP route.
 */
export function registerCreditRoutes(app: FastifyInstance, deps: CreditRoutesDependencies): void {
  const authHook = deps.requireUser || requireUser;

  // 1. GET /credits/balance
  app.get(
    '/credits/balance',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      try {
        const balance = await deps.getBalanceUseCase.execute(userId);
        return reply.status(200).send(balance);
      } catch (err) {
        if (err instanceof ProfileNotFoundError) {
          throw new AppError(err.code, err.status, err.message);
        }
        throw err;
      }
    }
  );

  // 2. GET /credits/ledger
  app.get(
    '/credits/ledger',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const query = (req.query ?? {}) as { limit?: string; offset?: string };
      const limit = query.limit !== undefined ? parseInt(query.limit, 10) : 50;
      const offset = query.offset !== undefined ? parseInt(query.offset, 10) : 0;

      if (query.limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
        throw new AppError('validation_error', 422, 'limit must be an integer between 1 and 100');
      }
      if (query.offset !== undefined && (Number.isNaN(offset) || offset < 0)) {
        throw new AppError('validation_error', 422, 'offset must be a non-negative integer');
      }

      const entries = await deps.listLedgerUseCase.execute(userId, limit, offset);
      return reply.status(200).send(entries);
    }
  );

  // 3. GET /credits/packages
  app.get(
    '/credits/packages',
    { preHandler: [authHook] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const packages = await deps.listPackagesUseCase.execute();
      return reply.status(200).send(packages);
    }
  );
}
