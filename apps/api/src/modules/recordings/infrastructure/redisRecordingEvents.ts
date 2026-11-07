import type { Cache } from '../../../platform/cache.js';
import type { RecordingStatusEvent } from '../domain/entities.js';
import type { RecordingEventsPort } from '../domain/ports.js';

const WAKE_CHANNEL = 'pipeline:wake';

function recordingChannel(recordingId: string): string {
  return `recording:${recordingId}`;
}

export class RedisRecordingEventsAdapter implements RecordingEventsPort {
  constructor(private readonly cache: Cache | null) {}

  private isRedisReady(): boolean {
    return Boolean(this.cache && this.cache.status === 'ready');
  }

  async publishWake(): Promise<void> {
    if (!this.isRedisReady()) return;
    try {
      await this.cache!.publish(WAKE_CHANNEL, '1');
    } catch {
      // Redis down: workers poll every 2 seconds as fallback
    }
  }

  async publishStatus(recordingId: string, event: RecordingStatusEvent): Promise<void> {
    if (!this.isRedisReady()) return;
    try {
      await this.cache!.publish(recordingChannel(recordingId), JSON.stringify(event));
    } catch {
      // Redis down: SSE streams fall back to polling Postgres every 2 seconds
    }
  }

  async subscribeStatus(
    recordingId: string,
    onEvent: (event: RecordingStatusEvent) => void
  ): Promise<{ unsubscribe: () => Promise<void>; usingRedis: boolean }> {
    if (!this.isRedisReady()) {
      return {
        usingRedis: false,
        unsubscribe: async () => {},
      };
    }

    let sub: Cache | null = null;
    try {
      sub = this.cache!.duplicate({
        lazyConnect: false,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });

      sub.on('error', () => {
        // Swallow subscriber connection errors so process never crashes
      });

      const channel = recordingChannel(recordingId);
      await sub.subscribe(channel);

      sub.on('message', (chan: string, message: string) => {
        if (chan !== channel) return;
        try {
          const parsed = JSON.parse(message) as RecordingStatusEvent;
          if (parsed && typeof parsed.status === 'string') {
            onEvent({
              status: parsed.status,
              error: parsed.error ?? null,
            });
          }
        } catch {
          // Ignore malformed pub/sub message
        }
      });

      return {
        usingRedis: true,
        unsubscribe: async () => {
          if (!sub) return;
          const client = sub;
          sub = null;
          try {
            await client.unsubscribe(channel);
            await client.quit();
          } catch {
            client.disconnect();
          }
        },
      };
    } catch {
      if (sub) {
        try {
          sub.disconnect();
        } catch {
          // Ignore
        }
      }
      return {
        usingRedis: false,
        unsubscribe: async () => {},
      };
    }
  }

  async subscribeWake(onWake: () => void): Promise<{ unsubscribe: () => Promise<void> }> {
    if (!this.isRedisReady()) {
      return {
        unsubscribe: async () => {},
      };
    }

    let sub: Cache | null = null;
    try {
      sub = this.cache!.duplicate({
        lazyConnect: false,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });

      sub.on('error', () => {
        // Swallow subscriber connection errors
      });

      await sub.subscribe(WAKE_CHANNEL);
      sub.on('message', (chan: string) => {
        if (chan === WAKE_CHANNEL) {
          onWake();
        }
      });

      return {
        unsubscribe: async () => {
          if (!sub) return;
          const client = sub;
          sub = null;
          try {
            await client.unsubscribe(WAKE_CHANNEL);
            await client.quit();
          } catch {
            client.disconnect();
          }
        },
      };
    } catch {
      if (sub) {
        try {
          sub.disconnect();
        } catch {
          // Ignore
        }
      }
      return {
        unsubscribe: async () => {},
      };
    }
  }
}
