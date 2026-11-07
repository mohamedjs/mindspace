import { describe, it, expect } from 'vitest';
import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { buildServer } from './server.js';
import type { Cache } from '../cache.js';
import type { AppConfig } from '../config.js';

describe('HTTP Server', () => {
  const dummyConfig: AppConfig = {
    NODE_ENV: 'test',
    PORT: 8080,
    DATABASE_URL: 'postgres://localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    DB_POOL_MAX: 10,
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    BYOK_MASTER_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    CORS_ORIGINS: 'http://localhost:3000',
    AUDIO_DIR: '/data/audio',
    OPENROUTER_API_KEY: 'mock-key',
  };

  function createHealthyDb() {
    return new Kysely<any>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    });
  }

  function createFailingDb() {
    return new Kysely<any>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => ({
          init: async () => {},
          acquireConnection: async () => {
            throw new Error('Postgres connection failed');
          },
          beginTransaction: async () => {},
          commitTransaction: async () => {},
          rollbackTransaction: async () => {},
          releaseConnection: async () => {},
          destroy: async () => {},
        }),
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    });
  }

  it('GET /health succeeds with 200 without dependencies', async () => {
    const mockDb = createFailingDb();
    const mockCache = { ping: async () => { throw new Error('Redis Down'); } } as any;

    const server = await buildServer({
      config: dummyConfig,
      db: mockDb,
      cache: mockCache,
    });

    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns 503 when Postgres fails', async () => {
    const mockDb = createFailingDb();
    const mockCache = { ping: async () => 'PONG' } as any;

    const server = await buildServer({
      config: dummyConfig,
      db: mockDb,
      cache: mockCache,
    });

    const res = await server.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('down');
    expect(body.postgres).toBe('down');
  });

  it('GET /health/ready returns 200 with { "redis": "down" } when only Redis fails', async () => {
    const mockDb = createHealthyDb();
    const mockCache = {
      ping: async () => {
        throw new Error('Redis connection refused');
      },
    } as any;

    const server = await buildServer({
      config: dummyConfig,
      db: mockDb,
      cache: mockCache,
    });

    const res = await server.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.postgres).toBe('ok');
    expect(body.redis).toBe('down');
  });

  it('enforces 1 MiB body limit on JSON payloads', async () => {
    const mockDb = createHealthyDb();
    const mockCache = { ping: async () => 'PONG' } as any;

    const server = await buildServer({
      config: dummyConfig,
      db: mockDb,
      cache: mockCache,
    });

    server.post('/echo', async (req) => req.body);

    const oversizedPayload = 'a'.repeat(1024 * 1024 + 100);
    const res = await server.inject({
      method: 'POST',
      url: '/echo',
      payload: { data: oversizedPayload },
    });

    expect(res.statusCode).toBe(413);
  });

  it('returns the error envelope for unknown routes', async () => {
    const server = await buildServer({
      config: dummyConfig,
      db: createHealthyDb(),
      cache: { ping: async () => 'PONG' } as unknown as Cache,
    });

    const res = await server.inject({ method: 'GET', url: '/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found', message: 'Not found' });
    await server.close();
  });

  it('sets production-grade security headers on all responses', async () => {
    const prodConfig = { ...dummyConfig, NODE_ENV: 'production' as const };
    const server = await buildServer({
      config: prodConfig,
      db: createHealthyDb(),
      cache: { ping: async () => 'PONG' } as unknown as Cache,
    });

    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['x-xss-protection']).toBe('0');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    await server.close();
  });

  describe('CORS checks', () => {
    it('allows requests from configured origin with credentials', async () => {
      const server = await buildServer({
        config: dummyConfig,
        db: createHealthyDb(),
        cache: { ping: async () => 'PONG' } as unknown as Cache,
      });

      const res = await server.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      await server.close();
    });

    it('omits allow-origin header for unauthorized origins', async () => {
      const server = await buildServer({
        config: dummyConfig,
        db: createHealthyDb(),
        cache: { ping: async () => 'PONG' } as unknown as Cache,
      });

      const res = await server.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'https://malicious-site.example.com',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      await server.close();
    });

    it('handles CORS preflight OPTIONS requests for allowed origin', async () => {
      const server = await buildServer({
        config: dummyConfig,
        db: createHealthyDb(),
        cache: { ping: async () => 'PONG' } as unknown as Cache,
      });

      const res = await server.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'POST',
        },
      });

      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      await server.close();
    });
  });

  describe('Route-level rate limits', () => {
    it('enforces route-specific rate limits and returns 429 envelope', async () => {
      const server = await buildServer({
        config: dummyConfig,
        db: createHealthyDb(),
        cache: { ping: async () => 'PONG', status: 'ready' } as unknown as Cache,
      });

      server.get(
        '/strict-limited',
        {
          config: {
            rateLimit: {
              max: 2,
              timeWindow: 60000,
            },
          },
        },
        async () => ({ ok: true })
      );

      // Request 1: ok
      const res1 = await server.inject({ method: 'GET', url: '/strict-limited' });
      expect(res1.statusCode).toBe(200);

      // Request 2: ok
      const res2 = await server.inject({ method: 'GET', url: '/strict-limited' });
      expect(res2.statusCode).toBe(200);

      // Request 3: rate limited
      const res3 = await server.inject({ method: 'GET', url: '/strict-limited' });
      expect(res3.statusCode).toBe(429);
      expect(res3.json().error).toBe('too_many_requests');
      await server.close();
    });
  });
});
