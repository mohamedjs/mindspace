import { apiFetch } from './client';
import { tokenStore } from './tokenStore';
import { apiRealtime } from './realtime';
import { apiNoteRepository } from './noteRepository';
import { apiBillingRepository } from './billingRepository';
import { apiKeyRepository } from './keyRepository';
import { apiRecordingRepository } from './recordingRepository';

describe('Web API Infrastructure', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    tokenStore.setSession({
      accessToken: 'stale-token',
      user: { id: 'u1', email: 'test@example.com', fullName: 'Test' },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('coalesces parallel 401 responses into a single /auth/refresh request', async () => {
    let refreshCalls = 0;
    const seenAuthHeaders: string[] = [];

    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return new Response(
          JSON.stringify({
            access_token: 'fresh-token',
            user: { id: 'u1', email: 'test@example.com' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const headers = new Headers(init?.headers);
      const auth = headers.get('Authorization') ?? '';
      seenAuthHeaders.push(auth);

      if (auth === 'Bearer stale-token') {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true, url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const results = await Promise.all([
      apiFetch<{ ok: boolean }>('/spaces'),
      apiFetch<{ ok: boolean }>('/credits/balance'),
      apiFetch<{ ok: boolean }>('/models'),
      apiFetch<{ ok: boolean }>('/keys'),
      apiFetch<{ ok: boolean }>('/account/profile'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(tokenStore.getAccessToken()).toBe('fresh-token');
  });

  it('reconnects SSE stream after unexpected disconnect and refreshes on 401 until terminal status', async () => {
    let sseCalls = 0;
    let refreshCalls = 0;

    function createSSEStream(frames: string[]) {
      const encoder = new TextEncoder();
      let idx = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (idx < frames.length) {
            controller.enqueue(encoder.encode(frames[idx++]));
          } else {
            controller.close();
          }
        },
      });
    }

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        return new Response(
          JSON.stringify({
            access_token: 'refreshed-sse-token',
            user: { id: 'u1', email: 'test@example.com' },
          }),
          { status: 200 }
        );
      }

      sseCalls++;
      if (sseCalls === 1) {
        // First attempt: 401 unauthorized
        return new Response(null, { status: 401 });
      }
      if (sseCalls === 2) {
        // Second attempt: emits transcribing then drops connection prematurely
        return new Response(
          createSSEStream(['data: {"status":"transcribing","error":null}\n\n']),
          { status: 200 }
        );
      }
      // Third attempt: reconnects and reaches terminal completed status
      return new Response(
        createSSEStream(['data: {"status":"completed","error":null}\n\n']),
        { status: 200 }
      );
    }) as typeof fetch;

    const events: Array<{ status: string; error: string | null }> = [];
    const unsubscribe = apiRealtime.watchRecording('rec-123', (ev) => {
      events.push(ev);
    });

    // Wait for reconnection backoff (~400ms)
    await new Promise((r) => setTimeout(r, 600));
    unsubscribe();

    expect(refreshCalls).toBe(1);
    expect(sseCalls).toBe(3);
    expect(events).toEqual([
      { status: 'transcribing', error: null },
      { status: 'completed', error: null },
    ]);
  });

  it('calls PATCH /notes/:id/content in noteRepository.updateContent', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method, body: String(init?.body ?? '') });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    await apiNoteRepository.updateContent('note-42', {
      title: 'Updated Title',
      content: 'Updated Body',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/notes\/note-42\/content$/);
    expect(calls[0].method).toBe('PATCH');
    expect(JSON.parse(calls[0].body!)).toEqual({
      title: 'Updated Title',
      content: 'Updated Body',
    });
  });

  it('unwraps { providers } in billingRepository.listPaymentProviders', async () => {
    global.fetch = jest.fn(async () => {
      return new Response(
        JSON.stringify({
          providers: [{ channel: 'test_pay', label: 'TestPay', enabled: true }],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const providers = await apiBillingRepository.listPaymentProviders();
    expect(providers).toEqual([{ channel: 'test_pay', label: 'TestPay', enabled: true }]);
  });

  it('omits baseUrl in keyRepository.save (AUDIT M1)', async () => {
    let sentBody: Record<string, unknown> | null = null;
    global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, keyHint: '1234' }), { status: 200 });
    }) as typeof fetch;

    await apiKeyRepository.save({
      provider: 'openai',
      apiKey: 'sk-test-1234',
      label: 'My Key',
      baseUrl: 'https://evil.example.com',
    });

    expect(sentBody).toEqual({
      provider: 'openai',
      apiKey: 'sk-test-1234',
      label: 'My Key',
    });
    expect(sentBody).not.toHaveProperty('baseUrl');
  });

  it('forwards parent_note_id and target_note_id in recordingRepository.create', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: 'rec-1' }), { status: 201 });
    }) as typeof fetch;

    await apiRecordingRepository.create({
      spaceId: 'sp-1',
      durationMs: 5000,
      parentNoteId: 'parent-1',
    });
    await apiRecordingRepository.create({
      spaceId: 'sp-1',
      durationMs: 6000,
      fillNoteId: 'target-1',
    });

    expect(bodies[0]).toEqual({
      duration_ms: 5000,
      parent_note_id: 'parent-1',
    });
    expect(bodies[1]).toEqual({
      duration_ms: 6000,
      target_note_id: 'target-1',
      process_mode: 'note_write',
    });
  });
});

describe('refreshAccessToken', () => {
  it('sends one refresh for concurrent callers, because reuse revokes the session', async () => {
    jest.resetModules();
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 't', user: { id: 'u', email: 'e' } }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { refreshAccessToken } = await import('./client');
    await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the session on a network failure, and ends it only on 401', async () => {
    jest.resetModules();
    const { refreshAccessToken } = await import('./client');
    const { tokenStore } = await import('./tokenStore');
    const session = { accessToken: 'a', user: { id: 'u', email: null, fullName: null } };
    tokenStore.setSession(session);

    global.fetch = jest.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    await refreshAccessToken();
    expect(tokenStore.getSession()).toEqual(session);

    global.fetch = jest.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch;
    await refreshAccessToken();
    expect(tokenStore.getSession()).toBeNull();
  });
});

describe('apiFetch', () => {
  it('omits Content-Type without a body, because Fastify rejects an empty JSON body', async () => {
    jest.resetModules();
    const fetchMock = jest.fn(async () => ({ status: 204, ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { apiFetch } = await import('./client');
    await apiFetch('/groups/1', { method: 'DELETE' });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Headers).has('Content-Type')).toBe(false);
  });
});
