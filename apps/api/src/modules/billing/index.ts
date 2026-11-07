import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Cache } from '../../platform/cache.js';
import { type Clock, systemClock } from '../../platform/clock.js';
import type { AppConfig } from '../../platform/config.js';
import type { Database } from '../../platform/db.js';
import {
  ConfirmSubscriptionUseCase,
  Entitlements,
  type EntitlementsOptions,
  ExpireSubscriptionsUseCase,
  GetSubscriptionUseCase,
  ListPlansUseCase,
  ListProvidersUseCase,
  StartSubscriptionUseCase,
} from './application/index.js';
import type {
  BillingCachePort,
  BillingCreditsPort,
  ConfirmStepHookPort,
  PaymentProviderRegistryPort,
} from './domain/ports.js';
import {
  KyselyBillingRepository,
  PaymentProviderRegistry,
  RedisBillingCache,
} from './infrastructure/index.js';
import { registerBillingRoutes } from './presentation/routes.js';

export interface BillingModuleDeps {
  db: Database;
  config: AppConfig;
  credits: BillingCreditsPort;
  cache?: Cache | null;
  requireAuth?: preHandlerHookHandler;
  clock?: Clock;
  entitlementsOptions?: EntitlementsOptions;
  providers?: PaymentProviderRegistryPort;
  confirmStepHook?: ConfirmStepHookPort | null;
}

export function createBillingModule(deps: BillingModuleDeps) {
  const clock = deps.clock ?? systemClock;
  const repo = new KyselyBillingRepository(deps.db);
  const billingCache: BillingCachePort | null = deps.cache
    ? new RedisBillingCache(deps.cache)
    : null;
  const providers =
    deps.providers ??
    new PaymentProviderRegistry({
      allowTestPay: Boolean(deps.config.ALLOW_TEST_PAY),
      nodeEnv: deps.config.NODE_ENV,
    });
  const entitlements = new Entitlements(repo, billingCache, deps.entitlementsOptions);

  const listPlansUseCase = new ListPlansUseCase(repo, billingCache);
  const getSubscriptionUseCase = new GetSubscriptionUseCase(repo);
  const listProvidersUseCase = new ListProvidersUseCase(providers);
  const startSubscriptionUseCase = new StartSubscriptionUseCase(
    repo,
    providers,
    entitlements,
    clock
  );
  const confirmSubscriptionUseCase = new ConfirmSubscriptionUseCase(
    repo,
    providers,
    deps.credits,
    entitlements,
    clock,
    deps.confirmStepHook
  );
  const expireSubscriptionsUseCase = new ExpireSubscriptionsUseCase(
    repo,
    entitlements,
    clock
  );

  return {
    repo,
    billingCache,
    providers,
    entitlements,
    listPlansUseCase,
    getSubscriptionUseCase,
    listProvidersUseCase,
    startSubscriptionUseCase,
    confirmSubscriptionUseCase,
    expireSubscriptionsUseCase,
    setConfirmStepHook(hook: ConfirmStepHookPort | null) {
      confirmSubscriptionUseCase.setStepHook(hook);
    },
    async registerRoutes(app: FastifyInstance, requireAuthOverride?: preHandlerHookHandler) {
      const authHook = requireAuthOverride ?? deps.requireAuth;
      if (!authHook) {
        throw new Error('requireAuth hook is required to register billing routes');
      }
      await registerBillingRoutes(app, {
        requireAuth: authHook,
        listPlansUseCase,
        getSubscriptionUseCase,
        listProvidersUseCase,
        startSubscriptionUseCase,
        confirmSubscriptionUseCase,
      });
    },
  };
}

export * from './domain/index.js';
export * from './application/index.js';
export * from './infrastructure/index.js';
export * from './presentation/index.js';
