import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

describe('Platform Config', () => {
  const validBaseEnv = {
    NODE_ENV: 'development',
    PORT: '8080',
    DATABASE_URL: 'postgres://mindspace:mindspace@localhost:5432/mindspace',
    REDIS_URL: 'redis://localhost:6379',
    DB_POOL_MAX: '20',
    JWT_SECRET: 'mindspace-super-secret-jwt-key-minimum-32-chars-long',
    BYOK_MASTER_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    CORS_ORIGINS: 'http://localhost:3000',
    AUDIO_DIR: '/data/audio',
    OPENROUTER_API_KEY: 'sk-or-v1-valid-key-for-development-use-only',
  };

  it('loads valid configuration successfully', () => {
    const config = loadConfig(validBaseEnv);
    expect(config.PORT).toBe(8080);
    expect(config.NODE_ENV).toBe('development');
    expect(config.DATABASE_URL).toBe(validBaseEnv.DATABASE_URL);
    expect(config.DB_POOL_MAX).toBe(20);
  });

  it('reports every missing key at once', () => {
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL is required[\s\S]*REDIS_URL is required[\s\S]*JWT_SECRET is required/);
  });

  it('refuses to start in production with placeholder secrets', () => {
    const prodEnv = {
      ...validBaseEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'placeholder-secret-that-is-at-least-32-characters',
    };

    expect(() => loadConfig(prodEnv)).toThrowError(/insecure placeholder value in production/);
  });

  it('refuses to start in production with all-zero BYOK_MASTER_KEY', () => {
    const prodEnv = {
      ...validBaseEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'a-genuine-production-jwt-secret-string-32-chars',
      OPENROUTER_API_KEY: 'sk-or-v1-genuine-production-key-here',
      BYOK_MASTER_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // 32 zero bytes
    };

    expect(() => loadConfig(prodEnv)).toThrowError(/all-zero placeholder key in production/);
  });
});
