import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { PartsStore } from '../src/parts-store.js';
import { Uploader } from '../src/uploader.js';

describe('Uploader - retry, resume, and order', () => {
  let store: PartsStore;
  let mockFetch: ReturnType<typeof vi.fn>;
  let token = 'mock-access-token';
  let refreshToken = 'mock-refresh-token';

  beforeEach(() => {
    store = new PartsStore(indexedDB);
    mockFetch = vi.fn();
    token = 'initial-token';
  });

  afterEach(async () => {
    await store.close();
    vi.restoreAllMocks();
  });

  describe('Part Upload and Order', () => {
    it('uploads pending parts in strict ascending partIndex order', async () => {
      const uploadOrder: number[] = [];

      mockFetch.mockImplementation(async (url: string) => {
        const match = url.match(/\/parts\/(\d+)$/);
        if (match) {
          uploadOrder.push(Number(match[1]));
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true }),
        };
      });

      // Save parts in reverse order
      await store.savePart({ recordingId: 'rec-order', partIndex: 2, blob: new Uint8Array([3]).buffer });
      await store.savePart({ recordingId: 'rec-order', partIndex: 0, blob: new Uint8Array([1]).buffer });
      await store.savePart({ recordingId: 'rec-order', partIndex: 1, blob: new Uint8Array([2]).buffer });

      const uploader = new Uploader({
        apiUrl: 'http://localhost:8080',
        partsStore: store,
        getAccessToken: async () => token,
        refreshAccessToken: async () => 'refreshed-token',
        fetchFn: mockFetch as any,
        initialRetryDelayMs: 1, // Fast for tests
      });

      const ok = await uploader.uploadPendingParts('rec-order');
      expect(ok).toBe(true);

      // Verify parts were uploaded strictly in order: 0, 1, 2
      expect(uploadOrder).toEqual([0, 1, 2]);

      // Verify all parts were deleted from IndexedDB after 2xx
      const remaining = await store.getPendingParts('rec-order');
      expect(remaining.length).toBe(0);
    });

    it('halts subsequent uploads if an earlier part fails to maintain strict order', async () => {
      const uploadOrder: number[] = [];

      mockFetch.mockImplementation(async (url: string) => {
        const match = url.match(/\/parts\/(\d+)$/);
        const idx = match ? Number(match[1]) : -1;
        uploadOrder.push(idx);

        if (idx === 0) {
          return { ok: true, status: 200, text: async () => '' };
        }
        if (idx === 1) {
          // Part 1 fails permanently
          return { ok: false, status: 500, text: async () => 'Internal Error' };
        }
        return { ok: true, status: 200, text: async () => '' };
      });

      await store.savePart({ recordingId: 'rec-halt', partIndex: 0, blob: new Uint8Array([1]).buffer });
      await store.savePart({ recordingId: 'rec-halt', partIndex: 1, blob: new Uint8Array([2]).buffer });
      await store.savePart({ recordingId: 'rec-halt', partIndex: 2, blob: new Uint8Array([3]).buffer });

      const uploader = new Uploader({
        apiUrl: 'http://localhost:8080',
        partsStore: store,
        getAccessToken: async () => token,
        refreshAccessToken: async () => null,
        fetchFn: mockFetch as any,
        maxRetries: 1,
        initialRetryDelayMs: 1,
      });

      const ok = await uploader.uploadPendingParts('rec-halt');
      expect(ok).toBe(false);

      // Part 0 succeeded, Part 1 attempted (and retried once), Part 2 was NEVER attempted!
      expect(uploadOrder).toEqual([0, 1, 1]);

      // Part 0 was deleted after 2xx, parts 1 and 2 remain in IndexedDB
      const remaining = await store.getAllParts('rec-halt');
      expect(remaining.map((p) => p.partIndex)).toEqual([1, 2]);
    });
  });

  describe('Upload Retry with Backoff', () => {
    it('retries on 500 server error and deletes part only after 2xx', async () => {
      let attempts = 0;
      const sleepSpy = vi.fn().mockResolvedValue(undefined);

      mockFetch.mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          return { ok: false, status: 500, text: async () => 'Server error' };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'part-0' }) };
      });

      const part = await store.savePart({
        recordingId: 'rec-retry',
        partIndex: 0,
        blob: new Uint8Array([10, 20]).buffer,
      });

      const uploader = new Uploader({
        apiUrl: 'http://localhost:8080',
        partsStore: store,
        getAccessToken: async () => token,
        refreshAccessToken: async () => null,
        fetchFn: mockFetch as any,
        maxRetries: 3,
        initialRetryDelayMs: 50,
        sleepFn: sleepSpy,
      });

      const success = await uploader.uploadPartWithRetry(part);
      expect(success).toBe(true);
      expect(attempts).toBe(3);

      // Sleep backoff was called: attempt 1 -> 50ms, attempt 2 -> 100ms
      expect(sleepSpy).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 50);
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 100);

      // Deleted from IndexedDB after 2xx
      const inDb = await store.getPart(part.id);
      expect(inDb).toBeUndefined();
    });

    it('retries on network TypeError and preserves part in DB if retries exhausted', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const part = await store.savePart({
        recordingId: 'rec-net-fail',
        partIndex: 0,
        blob: new Uint8Array([1, 2]).buffer,
      });

      const uploader = new Uploader({
        apiUrl: 'http://localhost:8080',
        partsStore: store,
        getAccessToken: async () => token,
        refreshAccessToken: async () => null,
        fetchFn: mockFetch as any,
        maxRetries: 2,
        initialRetryDelayMs: 1,
      });

      const success = await uploader.uploadPartWithRetry(part);
      expect(success).toBe(false);

      // Part is NOT deleted; still in DB with incremented attempts
      const inDb = await store.getPart(part.id);
      expect(inDb).toBeDefined();
      expect(inDb?.attempts).toBe(3); // Initial + 2 retries
      expect(inDb?.status).toBe('failed');
      expect(inDb?.error).toContain('Failed to fetch');
    });

    it('refreshes access token on 401 and retries upload with new token', async () => {
      let callCount = 0;
      let usedToken: string | undefined;

      const refreshFn = vi.fn().mockImplementation(async () => {
        token = 'new-shiny-token';
        return token;
      });

      mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
        callCount++;
        const authHeader = (init.headers as any)['Authorization'];
        usedToken = authHeader;

        if (callCount === 1) {
          return { ok: false, status: 401, text: async () => 'Unauthorized' };
        }
        return { ok: true, status: 200, text: async () => '{}' };
      });

      const part = await store.savePart({
        recordingId: 'rec-auth',
        partIndex: 0,
        blob: new Uint8Array([1]).buffer,
      });

      const uploader = new Uploader({
        apiUrl: 'http://localhost:8080',
        partsStore: store,
        getAccessToken: async () => token,
        refreshAccessToken: refreshFn,
        fetchFn: mockFetch as any,
        initialRetryDelayMs: 1,
      });

      const success = await uploader.uploadPartWithRetry(part);
      expect(success).toBe(true);
      expect(callCount).toBe(2);
      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(usedToken).toBe('Bearer new-shiny-token');

      // Deleted after 2xx
      const inDb = await store.getPart(part.id);
      expect(inDb).toBeUndefined();
    });
  });

  describe('Resume and Finish Recording', () => {
    it('resumes pending parts on startup and finishes recording when inactive', async () => {
      const finishedRecordings: string[] = [];

      mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
        if (url.endsWith('/finish') && init.method === 'POST') {
          const match = url.match(/\/recordings\/([^\/]+)\/finish/);
          if (match) {
            finishedRecordings.push(match[1]);
          }
          return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'queued' }) };
        }
        return { ok: true, status: 200, text: async () => '{}' };
      });

      // Leftover parts from interrupted recording
      await store.savePart({ recordingId: 'interrupted-rec', partIndex: 0, blob: new Uint8Array([1]).buffer });
      await store.savePart({ recordingId: 'interrupted-rec', partIndex: 1, blob: new Uint8Array([2]).buffer });

      const uploader = new Uploader({
        apiUrl: 'http://localhost:8080',
        partsStore: store,
        getAccessToken: async () => token,
        refreshAccessToken: async () => null,
        fetchFn: mockFetch as any,
        initialRetryDelayMs: 1,
      });

      const result = await uploader.resumePendingRecordings({
        isRecordingActive: () => false, // Browser restart -> recording is no longer active
      });

      expect(result.finished).toContain('interrupted-rec');
      expect(finishedRecordings).toContain('interrupted-rec');

      // All parts uploaded and cleaned up
      const remaining = await store.getPendingParts('interrupted-rec');
      expect(remaining.length).toBe(0);
    });
  });
});
