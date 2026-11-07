import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { composeApp, type AppComposition } from '../../composition.js';
import {
  ByokRequiredError,
  decryptApiKey,
  encryptApiKey,
  FakeKeyValidator,
  HttpKeyValidator,
  keyHint,
  KeyValidationFailedError,
  NoPlatformKeyError,
  PROVIDER_BASE_URL,
  UnsupportedProviderError,
} from './index.js';

describe('BYOK Module (04-credits-byok)', () => {
  let app: AppComposition;
  let fakeValidator: FakeKeyValidator;

  beforeAll(async () => {
    fakeValidator = new FakeKeyValidator();
    app = await composeApp(undefined, { keyValidator: fakeValidator });
  });

  afterAll(async () => {
    await app.close();
  });

  const testEmail = () =>
    `byok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  async function registerTestUser(name = 'BYOK User') {
    const email = testEmail();
    const res = await app.server.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email,
        password: 'Password123!',
        full_name: name,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    return {
      userId: body.user.id as string,
      email,
      token: body.access_token as string,
    };
  }

  describe('AES-256-GCM Crypto Compatibility with Deno crypto.ts', () => {
    const masterKeyBase64 = Buffer.alloc(32, 0x42).toString('base64');

    it('is byte-compatible with Deno WebCrypto AES-256-GCM (iv[12] || ciphertext || tag[16])', async () => {
      const plaintext = 'sk-proj-deno-compat-test-9876';

      // Produce a blob using raw WebCrypto exactly as supabase/functions/_shared/crypto.ts does
      const rawKeyBytes = Uint8Array.from(atob(masterKeyBase64), (c) => c.charCodeAt(0));
      const cryptoKey = await webcrypto.subtle.importKey(
        'raw',
        rawKeyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
      const iv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      const cipher = await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        new TextEncoder().encode(plaintext)
      );
      const denoBlob = new Uint8Array(iv.length + cipher.byteLength);
      denoBlob.set(iv, 0);
      denoBlob.set(new Uint8Array(cipher), iv.length);

      // 1. Decrypt Deno blob with our decryptApiKey
      const decrypted = await decryptApiKey(denoBlob, masterKeyBase64);
      expect(decrypted).toBe(plaintext);

      // 2. Encrypt with our encryptApiKey and decrypt with Deno WebCrypto logic
      const ourBlob = await encryptApiKey(plaintext, masterKeyBase64);
      expect(ourBlob.byteLength).toBe(12 + Buffer.byteLength(plaintext) + 16);

      const ourIv = ourBlob.slice(0, 12);
      const ourCipher = ourBlob.slice(12);
      const denoDecryptedBuf = await webcrypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ourIv },
        cryptoKey,
        ourCipher
      );
      expect(new TextDecoder().decode(denoDecryptedBuf)).toBe(plaintext);
    });

    it('rejects tampered ciphertext, wrong key, or invalid master key length, and formats keyHint with U+2026', async () => {
      const plaintext = 'sk-ant-api03-abcdef1234';
      const blob = await encryptApiKey(plaintext, masterKeyBase64);

      // Tamper with last byte (auth tag)
      const tampered = new Uint8Array(blob);
      tampered[tampered.length - 1] ^= 0xff;
      await expect(decryptApiKey(tampered, masterKeyBase64)).rejects.toThrow();

      // Wrong key
      const wrongKey = Buffer.alloc(32, 0x99).toString('base64');
      await expect(decryptApiKey(blob, wrongKey)).rejects.toThrow();

      // Invalid master key length
      await expect(encryptApiKey(plaintext, Buffer.alloc(16).toString('base64'))).rejects.toThrow(
        /32 bytes/
      );

      // keyHint uses U+2026
      expect(keyHint(plaintext)).toBe('…1234');
      expect(keyHint(plaintext).charCodeAt(0)).toBe(0x2026);
    });
  });

  describe('Provider Allow-list, No Custom baseUrl, and Live Key Validation (M1, M2)', () => {
    it('allows only openai, anthropic, google and rejects custom baseUrl (M1)', async () => {
      const user = await registerTestUser('Allowlist User');

      // 1. Custom baseUrl is rejected (M1 SSRF prevention)
      const ssrfRes = await app.server.inject({
        method: 'POST',
        url: '/keys',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          provider: 'openai',
          apiKey: 'sk-valid-openai-key-1111',
          baseUrl: 'http://169.254.169.254/latest/meta-data',
        },
      });
      expect(ssrfRes.statusCode).toBe(400);
      expect(ssrfRes.json().error).toBe('invalid_params');

      const ssrfSnakeRes = await app.server.inject({
        method: 'POST',
        url: '/keys',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          provider: 'openai',
          apiKey: 'sk-valid-openai-key-1111',
          base_url: 'https://evil.example.com/v1',
        },
      });
      expect(ssrfSnakeRes.statusCode).toBe(400);
      expect(ssrfSnakeRes.json().error).toBe('invalid_params');

      // 2. Disallowed providers (openrouter, nvidia, custom, unknown) are rejected
      for (const badProvider of ['openrouter', 'nvidia', 'custom', 'mistral']) {
        const res = await app.server.inject({
          method: 'POST',
          url: '/keys',
          headers: { authorization: `Bearer ${user.token}` },
          payload: {
            provider: badProvider,
            apiKey: 'sk-valid-looking-key-1234',
          },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('unsupported_provider');
      }

      // 3. Short key (< 8 chars) is rejected
      const shortRes = await app.server.inject({
        method: 'POST',
        url: '/keys',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          provider: 'openai',
          apiKey: 'short',
        },
      });
      expect(shortRes.statusCode).toBe(400);
      expect(shortRes.json().error).toBe('invalid_key_format');

      // 4. Key rejected by KeyValidator fails with 400 key_validation_failed (M2)
      const invalidKeyRes = await app.server.inject({
        method: 'POST',
        url: '/keys',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          provider: 'anthropic',
          apiKey: 'sk-ant-invalid-key-0000',
        },
      });
      expect(invalidKeyRes.statusCode).toBe(400);
      expect(invalidKeyRes.json().error).toBe('key_validation_failed');

      // Verify nothing was saved
      const listEmpty = await app.server.inject({
        method: 'GET',
        url: '/keys',
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(listEmpty.json()).toEqual([]);

      // 5. All three allow-listed providers (openai, anthropic, google) validate and save
      for (const provider of ['openai', 'anthropic', 'google'] as const) {
        const countBefore = fakeValidator.calls.length;
        const saveRes = await app.server.inject({
          method: 'POST',
          url: '/keys',
          headers: { authorization: `Bearer ${user.token}` },
          payload: {
            provider,
            apiKey: `sk-${provider}-live-valid-9999`,
            label: `${provider} key`,
          },
        });
        expect(saveRes.statusCode).toBe(200);
        expect(saveRes.json()).toEqual({
          ok: true,
          keyHint: '…9999',
        });
        expect(fakeValidator.calls.length).toBe(countBefore + 1);
        expect(fakeValidator.calls[fakeValidator.calls.length - 1]).toEqual({
          provider,
          apiKey: `sk-${provider}-live-valid-9999`,
        });
      }
    });

    it('HttpKeyValidator validates against provider /models endpoint and throws on non-2xx', async () => {
      const seenRequests: Array<{ url: string; auth: string | null }> = [];
      const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        const auth = headers.get('Authorization');
        seenRequests.push({ url, auth });
        if (auth === 'Bearer sk-good-key-1234') {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        return new Response('Unauthorized', { status: 401 });
      }) as typeof fetch;

      const validator = new HttpKeyValidator(mockFetch);
      await expect(validator.validate('openai', 'sk-good-key-1234')).resolves.toBeUndefined();
      expect(seenRequests[0]).toEqual({
        url: 'https://api.openai.com/v1/models',
        auth: 'Bearer sk-good-key-1234',
      });

      await expect(validator.validate('anthropic', 'sk-bad-key-0000')).rejects.toBeInstanceOf(
        KeyValidationFailedError
      );
    });
  });

  describe('Saving Replaces Existing Key, Security & User Isolation, and resolveKey (M3)', () => {
    it('replaces the existing key for the same provider regardless of label (M3)', async () => {
      const user = await registerTestUser('Replace Key User');

      // Save initial OpenAI key with no label
      const save1 = await app.server.inject({
        method: 'POST',
        url: '/keys',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          provider: 'openai',
          apiKey: 'sk-openai-first-key-1111',
        },
      });
      expect(save1.statusCode).toBe(200);
      expect(save1.json().keyHint).toBe('…1111');

      // Save second OpenAI key with a label -> must replace the first one!
      const save2 = await app.server.inject({
        method: 'POST',
        url: '/keys',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          provider: 'openai',
          apiKey: 'sk-openai-second-key-2222',
          label: 'Work OpenAI',
        },
      });
      expect(save2.statusCode).toBe(200);
      expect(save2.json().keyHint).toBe('…2222');

      // Save third OpenAI key with null label -> still only 1 key for openai!
      const save3 = await app.server.inject({
        method: 'POST',
        url: '/keys',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          provider: 'openai',
          apiKey: 'sk-openai-third-key-3333',
        },
      });
      expect(save3.statusCode).toBe(200);
      expect(save3.json().keyHint).toBe('…3333');

      const listRes = await app.server.inject({
        method: 'GET',
        url: '/keys',
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(listRes.statusCode).toBe(200);
      const keys = listRes.json();
      expect(keys.length).toBe(1);
      expect(keys[0].provider).toBe('openai');
      expect(keys[0].key_hint).toBe('…3333');
      expect(keys[0].label).toBeNull();

      // Verify resolveKey returns the latest key
      const resolved = await app.byokModule.resolveKey(user.userId, 'openai', true);
      expect(resolved).toEqual({
        apiKey: 'sk-openai-third-key-3333',
        usesPlatformKey: false,
        baseUrl: PROVIDER_BASE_URL.openai,
      });
    });

    it('never leaks encrypted_key or plaintext in GET /keys and enforces 404 cross-user isolation', async () => {
      const alice = await registerTestUser('Alice BYOK');
      const bob = await registerTestUser('Bob BYOK');
      const secretKey = 'sk-google-super-secret-key-7788';

      await app.server.inject({
        method: 'POST',
        url: '/keys',
        headers: { authorization: `Bearer ${alice.token}` },
        payload: {
          provider: 'google',
          apiKey: secretKey,
          label: 'Alice Gemini',
        },
      });

      const listRes = await app.server.inject({
        method: 'GET',
        url: '/keys',
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(listRes.statusCode).toBe(200);
      const rawBody = listRes.body;
      expect(rawBody).not.toContain('encrypted_key');
      expect(rawBody).not.toContain('\\x');
      expect(rawBody).not.toContain(secretKey);

      const aliceKeys = listRes.json();
      expect(aliceKeys.length).toBe(1);
      expect(Object.keys(aliceKeys[0]).sort()).toEqual(
        ['created_at', 'id', 'is_active', 'key_hint', 'label', 'last_error', 'provider'].sort()
      );
      const aliceKeyId = aliceKeys[0].id;

      // Bob cannot see Alice's key in GET /keys
      const bobListRes = await app.server.inject({
        method: 'GET',
        url: '/keys',
        headers: { authorization: `Bearer ${bob.token}` },
      });
      expect(bobListRes.statusCode).toBe(200);
      expect(bobListRes.json()).toEqual([]);

      // Bob gets 404 when attempting to DELETE Alice's key
      const bobDeleteRes = await app.server.inject({
        method: 'DELETE',
        url: `/keys/${aliceKeyId}`,
        headers: { authorization: `Bearer ${bob.token}` },
      });
      expect(bobDeleteRes.statusCode).toBe(404);
      expect(bobDeleteRes.json().error).toBe('key_not_found');

      // Alice's key still exists
      const aliceStillHasKey = await app.server.inject({
        method: 'GET',
        url: '/keys',
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(aliceStillHasKey.json().length).toBe(1);

      // Alice can delete her own key
      const aliceDeleteRes = await app.server.inject({
        method: 'DELETE',
        url: `/keys/${aliceKeyId}`,
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(aliceDeleteRes.statusCode).toBe(200);
      expect(aliceDeleteRes.json()).toEqual({ ok: true });

      // Deleting again returns 404
      const aliceDeleteAgain = await app.server.inject({
        method: 'DELETE',
        url: `/keys/${aliceKeyId}`,
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(aliceDeleteAgain.statusCode).toBe(404);
    });

    it('resolves user key first, rejects byokOnly without user key, and falls back to platform key', async () => {
      const user = await registerTestUser('Resolver User');

      // 1. No user key + byokOnly = true -> throws ByokRequiredError (400 byok_required)
      await expect(
        app.byokModule.resolveKey(user.userId, 'anthropic', true)
      ).rejects.toBeInstanceOf(ByokRequiredError);

      // 2. No user key + byokOnly = false for openrouter -> falls back to platform key
      const platformResolved = await app.byokModule.resolveKey(user.userId, 'openrouter', false);
      expect(platformResolved).toEqual({
        apiKey: app.config.OPENROUTER_API_KEY,
        usesPlatformKey: true,
        baseUrl: PROVIDER_BASE_URL.openrouter,
      });

      // 3. No user key + byokOnly = false + no platform key configured -> throws NoPlatformKeyError (500)
      await expect(
        app.byokModule.resolveKey(user.userId, 'nvidia', false)
      ).rejects.toBeInstanceOf(NoPlatformKeyError);

      // 4. Unknown provider -> throws UnsupportedProviderError (500)
      await expect(
        app.byokModule.resolveKey(user.userId, 'unknown_provider', false)
      ).rejects.toBeInstanceOf(UnsupportedProviderError);
    });
  });
});
