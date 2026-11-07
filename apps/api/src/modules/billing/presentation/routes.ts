import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { currentUserId } from '../../../platform/http/auth.js';
import { AppError } from '../../../platform/http/errors.js';
import type { ConfirmSubscriptionUseCase } from '../application/confirmSubscription.js';
import type { GetSubscriptionUseCase } from '../application/getSubscription.js';
import type { ListPlansUseCase } from '../application/listPlans.js';
import type { ListProvidersUseCase } from '../application/listProviders.js';
import type { StartSubscriptionUseCase } from '../application/startSubscription.js';
import {
  ActivePaidSubscriptionExistsError,
  AmountMismatchError,
  GrantFailedError,
  MissingBillingParamsError,
  PaymentNotVerifiedError,
  PaymentRecordFailedError,
  PlanDisabledError,
  PlanNotFoundError,
  ProviderNotConfiguredError,
  SubscriptionCreateFailedError,
  SubscriptionNotFoundError,
  UnknownPaymentChannelError,
} from '../domain/errors.js';

export interface BillingRoutesDeps {
  requireAuth: preHandlerHookHandler;
  listPlansUseCase: ListPlansUseCase;
  getSubscriptionUseCase: GetSubscriptionUseCase;
  listProvidersUseCase: ListProvidersUseCase;
  startSubscriptionUseCase: StartSubscriptionUseCase;
  confirmSubscriptionUseCase: ConfirmSubscriptionUseCase;
}

function mapBillingDomainError(err: unknown): never {
  if (err instanceof ProviderNotConfiguredError) {
    throw new AppError(err.code, err.status, err.message, {
      channel: err.channel,
      missing: err.missing,
    });
  }
  if (err instanceof PaymentNotVerifiedError) {
    throw new AppError(err.code, err.status, err.message, {
      reason: err.reason,
    });
  }
  if (
    err instanceof MissingBillingParamsError ||
    err instanceof PlanNotFoundError ||
    err instanceof PlanDisabledError ||
    err instanceof SubscriptionNotFoundError ||
    err instanceof SubscriptionCreateFailedError ||
    err instanceof UnknownPaymentChannelError ||
    err instanceof AmountMismatchError ||
    err instanceof PaymentRecordFailedError ||
    err instanceof GrantFailedError ||
    err instanceof ActivePaidSubscriptionExistsError
  ) {
    throw new AppError(err.code, err.status, err.message);
  }
  throw err;
}

export async function registerBillingRoutes(
  app: FastifyInstance,
  deps: BillingRoutesDeps
): Promise<void> {
  app.get(
    '/billing/plans',
    { preHandler: [deps.requireAuth] },
    async () => {
      try {
        return await deps.listPlansUseCase.execute();
      } catch (err) {
        mapBillingDomainError(err);
      }
    }
  );

  app.get(
    '/billing/subscription',
    { preHandler: [deps.requireAuth] },
    async (request) => {
      try {
        return await deps.getSubscriptionUseCase.execute(currentUserId(request));
      } catch (err) {
        mapBillingDomainError(err);
      }
    }
  );

  app.get(
    '/billing/providers',
    { preHandler: [deps.requireAuth] },
    async () => {
      try {
        return deps.listProvidersUseCase.execute();
      } catch (err) {
        mapBillingDomainError(err);
      }
    }
  );

  app.post(
    '/billing/subscriptions',
    { preHandler: [deps.requireAuth] },
    async (request) => {
      const body = (request.body ?? {}) as {
        planId?: string;
        channel?: string;
      };
      try {
        return await deps.startSubscriptionUseCase.execute({
          userId: currentUserId(request),
          planId: body.planId,
          channel: body.channel,
        });
      } catch (err) {
        mapBillingDomainError(err);
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    '/billing/subscriptions/:id/confirm',
    { preHandler: [deps.requireAuth] },
    async (request) => {
      const body = (request.body ?? {}) as {
        receipt?: unknown;
      };
      try {
        return await deps.confirmSubscriptionUseCase.execute({
          userId: currentUserId(request),
          subscriptionId: request.params.id,
          receipt: body.receipt,
        });
      } catch (err) {
        mapBillingDomainError(err);
      }
    }
  );
}
