import { Redis } from 'ioredis';
import type { AppConfig } from './config.js';

export type Cache = Redis;

export function createCache(config: AppConfig): Cache {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 100, 1000);
    },
    lazyConnect: false,
  });
}

export async function checkCacheHealth(cache: Cache): Promise<boolean> {
  try {
    const res = await cache.ping();
    return res === 'PONG';
  } catch {
    return false;
  }
}

export async function closeCache(cache: Cache): Promise<void> {
  try {
    await cache.quit();
  } catch {
    cache.disconnect();
  }
}
