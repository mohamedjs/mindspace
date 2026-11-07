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
});
