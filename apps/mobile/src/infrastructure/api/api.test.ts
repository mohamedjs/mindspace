import * as SecureStore from 'expo-secure-store';
import { tokenStore } from './tokenStore';
import { apiFetch, refreshAccessToken } from './client';
import { apiNoteRepository } from './noteRepository';
import { apiBillingRepository } from './billingRepository';
import { apiKeyRepository } from './keyRepository';
import { apiRecordingRepository } from './recordingRepository';
import { apiFunctions } from './functions';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const testUser = { id: 'u1', email: 'test@example.com', fullName: 'Test User' };

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('Mobile Infrastructure API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    tokenStore.setSession(null);
  });

  describe('tokenStore.init()', () => {
    it('hydrates refreshToken from SecureStore into memory for getRefreshToken()', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
        if (key === 'mindspace_refresh_token') return 'stored-refresh-token';
        if (key === 'mindspace_access_token') return null;
        return null;
      });

      await tokenStore.init();

      expect(tokenStore.getRefreshToken()).toBe('stored-refresh-token');
    });
  });

  describe('Single-flight 401 refresh', () => {
    it('deduplicates concurrent 401 refreshes into a single POST /auth/refresh call', async () => {
      tokenStore.setSession({ accessToken: 'expired-access', user: testUser }, 'valid-refresh');

      let refreshCalls = 0;
      mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/auth/refresh')) {
          refreshCalls += 1;
          await new Promise((r) => setTimeout(r, 20));
          return jsonResponse({
            access_token: 'fresh-access',
            refresh_token: 'fresh-refresh',
            user: { id: 'u1', email: 'test@example.com' },
          });
        }

        const headers = init?.headers as Headers | Record<string, string> | undefined;
        const auth =
          headers instanceof Headers
            ? headers.get('Authorization')
            : headers?.Authorization;
        if (auth === 'Bearer expired-access') {
          return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401);
        }

        return jsonResponse({ ok: true, url });
      });

      const [r1, r2, r3] = await Promise.all([
        apiFetch<{ ok: boolean }>('/spaces'),
        apiFetch<{ ok: boolean }>('/credits/balance'),
        apiFetch<{ ok: boolean }>('/billing/plans'),
      ]);

      expect(refreshCalls).toBe(1);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(r3.ok).toBe(true);
      expect(tokenStore.getAccessToken()).toBe('fresh-access');
      expect(tokenStore.getRefreshToken()).toBe('fresh-refresh');
    });

    it('refreshAccessToken returns new access token when refresh succeeds', async () => {
      tokenStore.setSession({ accessToken: 'old', user: testUser }, 'refresh-1');
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          access_token: 'new-access',
          refresh_token: 'refresh-2',
          user: { id: 'u1', email: 'test@example.com' },
        })
      );

      const newToken = await refreshAccessToken();
      expect(newToken).toBe('new-access');
      expect(tokenStore.getAccessToken()).toBe('new-access');
    });
  });

  describe('Repository endpoints & payloads', () => {
    beforeEach(() => {
      tokenStore.setSession({ accessToken: 'token-123', user: testUser }, 'refresh-123');
    });

    it('apiNoteRepository.updateContent calls PATCH /notes/:id/content', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await apiNoteRepository.updateContent('note-42', { title: 'Hello', content: 'World' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/notes\/note-42\/content$/),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ title: 'Hello', content: 'World' }),
        })
      );
    });

    it('apiBillingRepository.listPaymentProviders unwraps { providers }', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          providers: [
            { id: 'stripe', label: 'Card', channels: ['card'], hint: 'Pay with card' },
          ],
        })
      );

      const providers = await apiBillingRepository.listPaymentProviders();
      expect(providers).toEqual([
        { id: 'stripe', label: 'Card', channels: ['card'], hint: 'Pay with card' },
      ]);
    });

    it('apiKeyRepository.save omits baseUrl when empty or undefined', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true, keyHint: 'sk-...7890' }));

      const res = await apiKeyRepository.save({
        provider: 'openai',
        apiKey: 'sk-1234567890',
        label: 'Primary',
        baseUrl: undefined,
      });

      expect(res).toEqual({ ok: true, keyHint: 'sk-...7890' });
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({
        provider: 'openai',
        apiKey: 'sk-1234567890',
        label: 'Primary',
      });
      expect('baseUrl' in callBody).toBe(false);
    });

    it('apiRecordingRepository.create forwards parent_note_id and target_note_id', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'rec-1' }, 201));

      const recId = await apiRecordingRepository.create({
        spaceId: 'sp-1',
        durationMs: 12000,
        parentNoteId: 'parent-1',
        fillNoteId: 'target-1',
      });

      expect(recId).toBe('rec-1');
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toMatchObject({
        duration_ms: 12000,
        parent_note_id: 'parent-1',
        target_note_id: 'target-1',
        process_mode: 'note_write',
      });
    });

    it('apiFunctions.invoke maps ai-extract to POST /ai/extract', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'completed', notesCreated: 2 }));

      const res = await apiFunctions.invoke<{ status: string; notesCreated: number }>(
        'ai-extract',
        {
          recordingId: 'rec-1',
          spaceId: 'sp-1',
        }
      );

      expect(res).toEqual({ status: 'completed', notesCreated: 2 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/ai\/extract$/),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
