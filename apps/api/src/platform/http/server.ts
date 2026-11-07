import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import crypto from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { Database } from '../db.js';
import { checkDbHealth } from '../db.js';
import type { Cache } from '../cache.js';
import { checkCacheHealth } from '../cache.js';
import { createLogger } from '../logger.js';
import { handleHttpError } from './errors.js';

export interface ServerDependencies {
  config: AppConfig;
  db: Database;
  cache: Cache;
  logger?: any;
}

class FallbackRateLimitStore {
  private localStore = new Map<string, { current: number; resetAt: number }>();
  private redisClient: Cache | null;
  private timeWindow: number;

  constructor(options: { redis?: Cache | null; timeWindow?: number }) {
    this.redisClient = options?.redis || null;
    this.timeWindow = options?.timeWindow || 60000;
  }

  child(routeOptions: any) {
    return new FallbackRateLimitStore({
      redis: this.redisClient,
      timeWindow: routeOptions?.timeWindow || this.timeWindow,
    });
  }

  incr(key: string, cb: (err: Error | null, result?: { current: number; ttl: number }) => void): void {
    const timeWindow = this.timeWindow;
    const now = Date.now();

    const localIncr = () => {
      let entry = this.localStore.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { current: 1, resetAt: now + timeWindow };
      } else {
        entry.current += 1;
      }
      this.localStore.set(key, entry);
      const ttl = Math.max(0, entry.resetAt - now);
      cb(null, { current: entry.current, ttl });
    };

    if (!this.redisClient || this.redisClient.status !== 'ready') {
      localIncr();
      return;
    }

    this.redisClient
      .pipeline()
      .incr(key)
      .pttl(key)
      .exec()
      .then((results) => {
        if (!results || results[0]?.[0]) {
          localIncr();
          return;
        }
        const current = (results[0][1] as number) || 1;
        let pttl = (results[1]?.[1] as number) ?? -1;
        if (pttl < 0) {
          this.redisClient?.pexpire(key, timeWindow).catch(() => {});
          pttl = timeWindow;
        }
        cb(null, { current, ttl: pttl });
      })
      .catch(() => {
        localIncr();
      });
  }
}

export async function buildServer(deps: ServerDependencies): Promise<FastifyInstance> {
  const pinoLogger = deps.logger || createLogger();

  const app = fastify({
    bodyLimit: 1048576, // 1 MiB JSON limit
    loggerInstance: pinoLogger,
    genReqId: (req) => {
      const headerId = req.headers['x-request-id'];
      if (typeof headerId === 'string' && headerId.length > 0) {
        return headerId;
      }
      return crypto.randomUUID();
    },
  });

  app.decorate('db', deps.db);
  app.decorate('config', deps.config);

  const corsOrigins = deps.config.CORS_ORIGINS.split(',').map((s) => s.trim());
  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['Content-Range', 'X-Total-Count', 'X-Request-ID'],
  });

  await app.register(cookie);

  // Security headers on all responses
  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('x-xss-protection', '0');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    if (deps.config.NODE_ENV === 'production') {
      reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }
  });

  await app.register(rateLimit, {
    max: (deps.config as any).RATE_LIMIT_MAX ?? 1000,
    timeWindow: 60000,
    store: FallbackRateLimitStore as any,
    redis: deps.cache,
    skipOnError: true,
    keyGenerator: (req) => {
      const user = (req as any).user?.id;
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      const route = req.routeOptions?.url || req.raw.url?.split('?')[0] || 'global';
      return `rl:${route}:${user || ip}`;
    },
  });

  app.setNotFoundHandler((_request, reply) => {

    reply.status(404).send({ error: 'not_found', message: 'Not found' });

  });


  app.setErrorHandler(handleHttpError);

  app.get('/health', async (_req, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  app.get('/health/ready', async (_req, reply) => {
    const pgOk = await checkDbHealth(deps.db);
    const redisOk = await checkCacheHealth(deps.cache);

    if (!pgOk) {
      return reply.status(503).send({
        status: 'down',
        postgres: 'down',
        redis: redisOk ? 'ok' : 'down',
      });
    }

    if (!redisOk) {
      return reply.status(200).send({
        status: 'ok',
        postgres: 'ok',
        redis: 'down',
      });
    }

    return reply.status(200).send({
      status: 'ok',
      postgres: 'ok',
      redis: 'ok',
    });
  });

  return app;
}
