import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { sql } from 'kysely';
import { composeApp, composeWorker, type AppComposition } from '../../composition.js';
import { FakeAiChatProvider } from '../ai/infrastructure/fakeAiChatProvider.js';
import { MODELS_CACHE_KEY } from '../ai/infrastructure/kyselyAiModelRepo.js';
import { FakeTranscriber } from '../transcription/index.js';
import {
  ENTITLEMENTS_CACHE_TTL_SECONDS,
  PLANS_CACHE_KEY,
  PLANS_CACHE_TTL_SECONDS,
  TestPayProvider,
  entitlementsCacheKey,
} from './index.js';

const execFileAsync = promisify(execFile);

async function generateToneBuffer(
  tempDir: string,
  ext: 'webm' | 'wav' | 'mp3',
  durationSeconds: number
): Promise<Buffer> {
  const filePath = join(
    tempDir,
    `tone_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  );

  const codecArgs: Record<typeof ext, string[]> = {
    wav: ['-c:a', 'pcm_u8'],
    webm: ['-c:a', 'libopus', '-b:a', '16k'],
    mp3: ['-c:a', 'libmp3lame', '-b:a', '24k'],
  };

  await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:sample_rate=8000:duration=${durationSeconds}`,
      ...codecArgs[ext],
      filePath,
    ],
    { timeout: 60_000 }
  );

  const buf = await readFile(filePath);
  await rm(filePath, { force: true }).catch(() => {});
  return buf;
}

describe('Billing, Entitlements, Disk Abuse Protections & Worker Maintenance (Phase 07)', () => {
  let app: AppComposition;
  let fakeChatProvider: FakeAiChatProvider;
  let fakeTranscriber: FakeTranscriber;
  let audioDir: string;
  let toneScratchDir: string;
  let wavTone1s: Buffer;

  beforeAll(async () => {
    audioDir = await mkdtemp(join(tmpdir(), 'mindspace-billing-test-'));
    toneScratchDir = await mkdtemp(join(tmpdir(), 'mindspace-billing-tones-'));
    wavTone1s = await generateToneBuffer(toneScratchDir, 'wav', 1);

    fakeChatProvider = new FakeAiChatProvider();
    fakeTranscriber = new FakeTranscriber();

    app = await composeApp(
      {
        NODE_ENV: 'test',
        ALLOW_TEST_PAY: true,
        AUDIO_DIR: audioDir,
        STT_CONCURRENCY: 4,
        LLM_CONCURRENCY: 4,
        PIPELINE_WORKERS: 4,
      },
      {
        transcriber: fakeTranscriber,
        chatProvider: fakeChatProvider,
        entitlementsOptions: {
          // Small quota for fast deterministic quota tests (4 KiB for free, 50 KiB for paid)
          freeStoredAudioBytes: 4 * 1024,
          paidStoredAudioBytes: 50 * 1024,
        },
        sseHeartbeatMs: 100,
        ssePollIntervalMs: 50,
      }
    );
  });

  afterAll(async () => {
    await app.close();
    await rm(audioDir, { recursive: true, force: true }).catch(() => {});
    await rm(toneScratchDir, { recursive: true, force: true }).catch(() => {});
  });

  beforeEach(async () => {
    app.billingModule.setConfirmStepHook(null);
    fakeChatProvider.reset();
    fakeTranscriber.reset();
    fakeTranscriber.setHandler(() => ({
      text: 'Transcribed billing test audio.',
      language: 'en',
    }));
    await app.cache.del(PLANS_CACHE_KEY, MODELS_CACHE_KEY).catch(() => {});
  });

  async function registerUser(emailPrefix: string): Promise<{
    userId: string;
    token: string;
    spaceId: string;
  }> {
    const email = `billing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${emailPrefix}@example.com`;
    const signUpRes = await app.server.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email,
        password: 'Password123!',
        full_name: 'Billing Test User',
      },
    });
    expect(signUpRes.statusCode).toBe(200);
    const body = signUpRes.json();
    const token = body.access_token as string;
    const userId = body.user.id as string;

    const spacesRes = await app.server.inject({
      method: 'GET',
      url: '/spaces',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(spacesRes.statusCode).toBe(200);
    const spaces = spacesRes.json();
    return { userId, token, spaceId: spaces[0].id as string };
  }

  describe('Plans, Providers & Redis Cache Fallback', () => {
    it('lists enabled plans ordered by sort_order and caches them in Redis under cache:plans (TTL 5m)', async () => {
      const { token } = await registerUser('plans');

      const res = await app.server.inject({
        method: 'GET',
        url: '/billing/plans',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.plans)).toBe(true);
      expect(body.plans.map((p: any) => p.id)).toEqual([
        'free',
        'hobby',
        'plus',
        'pro',
        'max',
        'byok',
      ]);

      const cachedRaw = await app.cache.get(PLANS_CACHE_KEY);
      expect(cachedRaw).toBeTruthy();
      const ttl = await app.cache.ttl(PLANS_CACHE_KEY);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(PLANS_CACHE_TTL_SECONDS);
    });

    it('caches AI models in Redis under cache:models (TTL 5m) and falls through to Postgres when Redis is down', async () => {
      const { token } = await registerUser('models-cache');

      const res1 = await app.server.inject({
        method: 'GET',
        url: '/models',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res1.statusCode).toBe(200);
      const cachedModels = await app.cache.get(MODELS_CACHE_KEY);
      expect(cachedModels).toBeTruthy();
      const ttl = await app.cache.ttl(MODELS_CACHE_KEY);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);

      // Simulate Redis outage on get/set and verify both /billing/plans and /models fall through to Postgres
      const origGet = app.cache.get.bind(app.cache);
      const origSet = app.cache.set.bind(app.cache);
      (app.cache as any).get = async () => {
        throw new Error('Redis connection refused');
      };
      (app.cache as any).set = async () => {
        throw new Error('Redis connection refused');
      };

      try {
        const plansFallback = await app.server.inject({
          method: 'GET',
          url: '/billing/plans',
          headers: { authorization: `Bearer ${token}` },
        });
        expect(plansFallback.statusCode).toBe(200);
        expect(plansFallback.json().plans.length).toBe(6);

        const modelsFallback = await app.server.inject({
          method: 'GET',
          url: '/models',
          headers: { authorization: `Bearer ${token}` },
        });
        expect(modelsFallback.statusCode).toBe(200);
        expect(Array.isArray(modelsFallback.json())).toBe(true);
        expect(modelsFallback.json().length).toBeGreaterThan(0);
      } finally {
        (app.cache as any).get = origGet;
        (app.cache as any).set = origSet;
      }
    });

    it('lists payment providers and their configuration status', async () => {
      const { token } = await registerUser('providers');

      const res = await app.server.inject({
        method: 'GET',
        url: '/billing/providers',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const providers = res.json().providers;
      expect(providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ channel: 'test_pay', isConfigured: true }),
          expect.objectContaining({ channel: 'google_pay', isConfigured: false }),
          expect.objectContaining({ channel: 'apple_pay', isConfigured: false }),
          expect.objectContaining({ channel: 'instapay', isConfigured: false }),
        ])
      );
    });
  });

  describe('TestPay Production Refusal', () => {
    it('refuses startup when NODE_ENV=production and ALLOW_TEST_PAY=true', async () => {
      await expect(
        composeApp({
          NODE_ENV: 'production',
          ALLOW_TEST_PAY: true,
          JWT_SECRET: 'prod-secret-that-is-at-least-32-bytes-long!!',
          BYOK_MASTER_KEY: Buffer.alloc(32, 9).toString('base64'),
        })
      ).rejects.toThrow(/ALLOW_TEST_PAY/);
    });

    it('refuses TestPay verification when nodeEnv is production even if allowTestPay is true', async () => {
      const prodTestPay = new TestPayProvider({
        allowTestPay: true,
        nodeEnv: 'production',
      });
      expect(prodTestPay.isConfigured).toBe(false);

      const verifyRes = await prodTestPay.verify({
        reference: 'sub_1234567890ab',
        amountEgp: 150,
        receipt: {},
      });
      expect(verifyRes).toEqual({
        status: 'failed',
        reason: 'TestPay is disabled in this environment',
      });
    });
  });

  describe('Subscription Start, Free-Plan Protection & Ownership', () => {
    it('activates free plan immediately for unsubscribed user, but refuses to replace an active paid subscription', async () => {
      const { userId, token } = await registerUser('free-guard');

      // 1. Starting free plan when user has no active paid subscription succeeds immediately
      const freeStart = await app.server.inject({
        method: 'POST',
        url: '/billing/subscriptions',
        headers: { authorization: `Bearer ${token}` },
        payload: { planId: 'free', channel: 'test_pay' },
      });
      expect(freeStart.statusCode).toBe(200);
      expect(freeStart.json()).toMatchObject({
        free: true,
        plan: { id: 'free', priceEgp: 0, credits: 0 },
      });

      // 2. Upgrade to paid 'plus' plan and confirm
      const plusStart = await app.server.inject({
        method: 'POST',
        url: '/billing/subscriptions',
        headers: { authorization: `Bearer ${token}` },
        payload: { planId: 'plus', channel: 'test_pay' },
      });
      expect(plusStart.statusCode).toBe(200);
      const plusSubId = plusStart.json().subscriptionId as string;

      const confirmRes = await app.server.inject({
        method: 'POST',
        url: `/billing/subscriptions/${plusSubId}/confirm`,
        headers: { authorization: `Bearer ${token}` },
        payload: { receipt: {} },
      });
      expect(confirmRes.statusCode).toBe(200);
      expect(confirmRes.json().creditsGranted).toBe(2025);

      // 3. Attempting to start a free plan while paid subscription is active is rejected with 409
      const replaceAttempt = await app.server.inject({
        method: 'POST',
        url: '/billing/subscriptions',
        headers: { authorization: `Bearer ${token}` },
        payload: { planId: 'free', channel: 'test_pay' },
      });
      expect(replaceAttempt.statusCode).toBe(409);
      expect(replaceAttempt.json().error).toBe('active_paid_subscription_exists');

      // Verify user's active subscription is still 'plus' and entitlements are still AI-enabled
      const activeSubRes = await app.server.inject({
        method: 'GET',
        url: '/billing/subscription',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(activeSubRes.statusCode).toBe(200);
      expect(activeSubRes.json().subscription.plan_id).toBe('plus');

      const ent = await app.billingModule.entitlements.forUser(userId);
      expect(ent.planId).toBe('plus');
      expect(ent.aiEnabled).toBe(true);
    });

    it('returns 404 when a foreign user attempts to confirm User A subscription', async () => {
      const userA = await registerUser('owner-a');
      const userB = await registerUser('foreign-b');

      const startRes = await app.server.inject({
        method: 'POST',
        url: '/billing/subscriptions',
        headers: { authorization: `Bearer ${userA.token}` },
        payload: { planId: 'plus', channel: 'test_pay' },
      });
      expect(startRes.statusCode).toBe(200);
      const subId = startRes.json().subscriptionId as string;

      const foreignConfirm = await app.server.inject({
        method: 'POST',
        url: `/billing/subscriptions/${subId}/confirm`,
        headers: { authorization: `Bearer ${userB.token}` },
        payload: { receipt: {} },
      });
      expect(foreignConfirm.statusCode).toBe(404);
      expect(foreignConfirm.json().error).toBe('subscription_not_found');
    });

    it('returns 501 provider_not_configured with channel and missing secrets for unconfigured provider', async () => {
      const { token } = await registerUser('unconfigured-provider');

      const res = await app.server.inject({
        method: 'POST',
        url: '/billing/subscriptions',
        headers: { authorization: `Bearer ${token}` },
        payload: { planId: 'plus', channel: 'google_pay' },
      });
      expect(res.statusCode).toBe(501);
      expect(res.json()).toMatchObject({
        error: 'provider_not_configured',
        channel: 'google_pay',
        missing: expect.arrayContaining(['GOOGLE_PAY_MERCHANT_ID']),
      });
    });
  });

  describe('Confirm Atomicity & Step-by-Step Fault Injection', () => {
    it('leaves a retryable state with no lost or doubled credits when failure is injected at each confirm step', async () => {
      const { userId, token } = await registerUser('fault-inject');

      const startRes = await app.server.inject({
        method: 'POST',
        url: '/billing/subscriptions',
        headers: { authorization: `Bearer ${token}` },
        payload: { planId: 'plus', channel: 'test_pay' },
      });
      expect(startRes.statusCode).toBe(200);
      const subId = startRes.json().subscriptionId as string;

      // Step 1 failure: before payment insert
      app.billingModule.setConfirmStepHook({
        onBeforeInsertPayment: async () => {
          throw new Error('Simulated DB crash before payment insert');
        },
      });

      const fail1 = await app.server.inject({
        method: 'POST',
        url: `/billing/subscriptions/${subId}/confirm`,
        headers: { authorization: `Bearer ${token}` },
        payload: { receipt: { externalRef: `ref_fault_${subId}` } },
      });
      expect(fail1.statusCode).toBe(500);

      // Step 2 failure: after payment insert, before credit grant
      app.billingModule.setConfirmStepHook({
        onBeforeGrantCredits: async () => {
          throw new Error('Simulated crash after payment insert, before credit grant');
        },
      });

      const fail2 = await app.server.inject({
        method: 'POST',
        url: `/billing/subscriptions/${subId}/confirm`,
        headers: { authorization: `Bearer ${token}` },
        payload: { receipt: { externalRef: `ref_fault_${subId}` } },
      });
      expect(fail2.statusCode).toBe(500);

      // Step 3 failure: after payment insert AND credit grant, before subscription activation
      app.billingModule.setConfirmStepHook({
        onBeforeActivateSubscription: async () => {
          throw new Error('Simulated crash after credit grant, before subscription activation');
        },
      });

      const fail3 = await app.server.inject({
        method: 'POST',
        url: `/billing/subscriptions/${subId}/confirm`,
        headers: { authorization: `Bearer ${token}` },
        payload: { receipt: { externalRef: `ref_fault_${subId}` } },
      });
      expect(fail3.statusCode).toBe(500);

      // Verify all three failed transactions rolled back completely:
      // - Subscription is still 'pending'
      // - 0 rows in payments for this subscription
      // - User balance is still signup bonus (100) and 0 'purchase' ledger entries
      const subBeforeRetry = await app.db
        .selectFrom('subscriptions')
        .selectAll()
        .where('id', '=', subId)
        .executeTakeFirstOrThrow();
      expect(subBeforeRetry.status).toBe('pending');

      const paymentsBeforeRetry = await app.db
        .selectFrom('payments')
        .selectAll()
        .where('subscription_id', '=', subId)
        .execute();
      expect(paymentsBeforeRetry.length).toBe(0);

      const balBeforeRetry = await app.creditsModule.getBalance(userId);
      expect(balBeforeRetry.credits_balance).toBe(100);

      // Remove fault hook and retry confirm: must succeed and grant credits once
      app.billingModule.setConfirmStepHook(null);

      const successRes = await app.server.inject({
        method: 'POST',
        url: `/billing/subscriptions/${subId}/confirm`,
        headers: { authorization: `Bearer ${token}` },
        payload: { receipt: { externalRef: `ref_fault_${subId}` } },
      });
      expect(successRes.statusCode).toBe(200);
      expect(successRes.json()).toMatchObject({
        subscriptionId: subId,
        status: 'active',
        creditsGranted: 2025,
      });

      // Retry again on already-active subscription: idempotent, 0 extra credits
      const retryRes = await app.server.inject({
        method: 'POST',
        url: `/billing/subscriptions/${subId}/confirm`,
        headers: { authorization: `Bearer ${token}` },
        payload: { receipt: { externalRef: `ref_fault_${subId}` } },
      });
      expect(retryRes.statusCode).toBe(200);
      expect(retryRes.json()).toMatchObject({
        subscriptionId: subId,
        status: 'active',
        alreadyActive: true,
        creditsGranted: 0,
      });

      const finalBal = await app.creditsModule.getBalance(userId);
      expect(finalBal.credits_balance).toBe(2125);

      const purchaseLedgerRows = await app.db
        .selectFrom('credit_ledger')
        .selectAll()
        .where('user_id', '=', userId)
        .where('reason', '=', 'purchase')
        .execute();
      expect(purchaseLedgerRows.length).toBe(1);
      expect(Number(purchaseLedgerRows[0].delta)).toBe(2025);
    });
  });

  describe('Entitlements Caching & Free-Plan AI Rejection', () => {
    it('caches Entitlements.forUser(id) for 60s in Redis and deletes cache on subscription change', async () => {
      const { userId, token } = await registerUser('entitlements-cache');

      await app.cache.del(entitlementsCacheKey(userId));
      const initialEnt = await app.billingModule.entitlements.forUser(userId);
      expect(initialEnt).toMatchObject({
        planId: 'free',
        aiEnabled: false,
        maxRecordingMinutes: 0,
      });

      const cachedRaw = await app.cache.get(entitlementsCacheKey(userId));
      expect(cachedRaw).toBeTruthy();
      const ttl = await app.cache.ttl(entitlementsCacheKey(userId));
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(ENTITLEMENTS_CACHE_TTL_SECONDS);

      // Upgrade to 'plus' and confirm -> cache must be invalidated and reflect 'plus' immediately
      const startRes = await app.server.inject({
        method: 'POST',
        url: '/billing/subscriptions',
        headers: { authorization: `Bearer ${token}` },
        payload: { planId: 'plus', channel: 'test_pay' },
      });
      const subId = startRes.json().subscriptionId as string;

      const confirmRes = await app.server.inject({
        method: 'POST',
        url: `/billing/subscriptions/${subId}/confirm`,
        headers: { authorization: `Bearer ${token}` },
        payload: { receipt: {} },
      });
      expect(confirmRes.statusCode).toBe(200);

      const updatedEnt = await app.billingModule.entitlements.forUser(userId);
      expect(updatedEnt).toMatchObject({
        planId: 'plus',
        aiEnabled: true,
        maxRecordingMinutes: 30,
      });
    });

    it('rejects pipeline start with ai_not_in_plan for a free-plan user', async () => {
      const { userId, token, spaceId } = await registerUser('free-no-ai');

      const createRes = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/recordings`,
        headers: { authorization: `Bearer ${token}` },
        payload: { kind: 'note', processMode: 'extract' },
      });
      expect(createRes.statusCode).toBe(201);
      const recordingId = createRes.json().id as string;

      const smallWav = wavTone1s.subarray(0, 1024);
      const uploadRes = await app.server.inject({
        method: 'PUT',
        url: `/recordings/${recordingId}/parts/0`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'audio/wav',
        },
        payload: smallWav,
      });
      expect(uploadRes.statusCode).toBe(200);

      // Calling finish on free plan rejects with 403 ai_not_in_plan
      const finishRes = await app.server.inject({
        method: 'POST',
        url: `/recordings/${recordingId}/finish`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(finishRes.statusCode).toBe(403);
      expect(finishRes.json().error).toBe('ai_not_in_plan');

      const recRow = await app.db
        .selectFrom('recordings')
        .select(['status', 'error'])
        .where('id', '=', recordingId)
        .where('user_id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(recRow.status).toBe('failed');
      expect(recRow.error).toBe('ai_not_in_plan');
    });
  });

  describe('Disk Abuse Protections on PUT /recordings/:id/parts/:idx', () => {
    it('rejects part idx at or above ceil(maxRecordingMinutes / 5) + 2 on upload', async () => {
      const { token, spaceId } = await registerUser('idx-cap');

      // Free plan has maxRecordingMinutes = 0 -> ceil(0 / 5) + 2 = 2 (allowed idx: 0, 1; idx >= 2 rejected)
      const createRes = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/recordings`,
        headers: { authorization: `Bearer ${token}` },
        payload: { kind: 'note' },
      });
      expect(createRes.statusCode).toBe(201);
      const recordingId = createRes.json().id as string;

      const smallWav = wavTone1s.subarray(0, 1024);
      const allowedRes = await app.server.inject({
        method: 'PUT',
        url: `/recordings/${recordingId}/parts/1`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'audio/wav',
        },
        payload: smallWav,
      });
      expect(allowedRes.statusCode).toBe(200);

      const rejectedRes = await app.server.inject({
        method: 'PUT',
        url: `/recordings/${recordingId}/parts/2`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'audio/wav',
        },
        payload: smallWav,
      });
      expect(rejectedRes.statusCode).toBe(400);
      expect(rejectedRes.json().error).toBe('part_index_exceeded');
    });

    it('enforces per-user stored-audio quota', async () => {
      const { token, spaceId } = await registerUser('audio-quota');

      const createRes = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/recordings`,
        headers: { authorization: `Bearer ${token}` },
        payload: { kind: 'note' },
      });
      expect(createRes.statusCode).toBe(201);
      const recordingId = createRes.json().id as string;

      // Free user quota in this test suite is configured to 4 KiB (4096 bytes).
      // wavTone1s is ~8 KiB (1s @ 8000 Hz PCM), so uploading it exceeds the 4 KiB quota:
      const smallWav = wavTone1s.subarray(0, 2048);
      const upload0 = await app.server.inject({
        method: 'PUT',
        url: `/recordings/${recordingId}/parts/0`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'audio/wav',
        },
        payload: smallWav,
      });
      expect(upload0.statusCode).toBe(200);

      // Uploading a second 3 KiB part pushes user total over 4 KiB -> 413 audio_quota_exceeded
      const upload1 = await app.server.inject({
        method: 'PUT',
        url: `/recordings/${recordingId}/parts/1`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'audio/wav',
        },
        payload: wavTone1s.subarray(0, 3000),
      });
      expect(upload1.statusCode).toBe(413);
      expect(upload1.json().error).toBe('audio_quota_exceeded');
    });

    it('sweeps unfinished recording parts older than 24 hours (deleting disk files and recording_parts rows)', async () => {
      const { userId, token, spaceId } = await registerUser('unfinished-sweep');

      const createRes = await app.server.inject({
        method: 'POST',
        url: `/spaces/${spaceId}/recordings`,
        headers: { authorization: `Bearer ${token}` },
        payload: { kind: 'note' },
      });
      expect(createRes.statusCode).toBe(201);
      const recordingId = createRes.json().id as string;

      const smallWav = wavTone1s.subarray(0, 1024);
      const uploadRes = await app.server.inject({
        method: 'PUT',
        url: `/recordings/${recordingId}/parts/0`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'audio/wav',
        },
        payload: smallWav,
      });
      expect(uploadRes.statusCode).toBe(200);
      const blobKey = uploadRes.json().blob_key as string;
      expect(await app.recordingsModule.blobStore.exists(blobKey)).toBe(true);

      // Backdate recording created_at to 25 hours ago while still in 'recorded' status
      await sql`
        UPDATE public.recordings
           SET created_at = now() - interval '25 hours'
         WHERE id = ${recordingId}::uuid
           AND user_id = ${userId}::uuid
      `.execute(app.db);

      const worker = app.recordingsModule.createWorker();
      const sweepRes = await worker.runUnfinishedRecordingsSweep();
      expect(sweepRes.acquired).toBe(true);
      expect(sweepRes.sweptRecordings).toBeGreaterThanOrEqual(1);
      expect(sweepRes.deletedParts).toBeGreaterThanOrEqual(1);

      expect(await app.recordingsModule.blobStore.exists(blobKey)).toBe(false);
      const remainingParts = await app.db
        .selectFrom('recording_parts')
        .selectAll()
        .where('recording_id', '=', recordingId)
        .execute();
      expect(remainingParts.length).toBe(0);
    });
  });

  describe('Worker Maintenance Jobs with pg_try_advisory_lock', () => {
    it('two workers running monthly refill concurrently execute one refill with true deltas (100 - old_balance)', async () => {
      const { userId } = await registerUser('two-workers-refill');

      // Spend 65 credits via reserve + settle so balance is 35 and ledger sum is 35
      const resId = await app.creditsModule.reserve(userId, 65);
      await app.db.transaction().execute(async (tx) => {
        await app.creditsModule.settle(resId, userId, 65, null, tx);
      });

      // Set free_refill_at to 2 months ago
      await sql`
        UPDATE public.profiles
           SET free_refill_at = (date_trunc('month', CURRENT_DATE) - interval '2 months')::date
         WHERE id = ${userId}::uuid
      `.execute(app.db);

      const worker1 = await composeWorker({
        NODE_ENV: 'test',
        ALLOW_TEST_PAY: true,
        AUDIO_DIR: audioDir,
      });
      const worker2 = await composeWorker({
        NODE_ENV: 'test',
        ALLOW_TEST_PAY: true,
        AUDIO_DIR: audioDir,
      });

      try {
        const [res1, res2] = await Promise.all([
          worker1.worker.runMonthlyRefill(),
          worker2.worker.runMonthlyRefill(),
        ]);

        // Total refilled count for this user across both workers must be 1, and ledger delta must be 65 (100 - 35)
        const totalRefilled = res1.refilledCount + res2.refilledCount;
        expect(totalRefilled).toBeGreaterThanOrEqual(1);

        const bal = await app.creditsModule.getBalance(userId);
        expect(bal.credits_balance).toBe(100);

        const refillEntries = await app.db
          .selectFrom('credit_ledger')
          .selectAll()
          .where('user_id', '=', userId)
          .where('reason', '=', 'monthly_refill')
          .execute();
        expect(refillEntries.length).toBe(1);
        expect(Number(refillEntries[0].delta)).toBe(65);
        expect(Number(refillEntries[0].balance_after)).toBe(100);
      } finally {
        await worker1.close();
        await worker2.close();
      }
    });

    it('expires due subscriptions and invalidates user entitlements cache', async () => {
      const { userId, token } = await registerUser('sub-expiry');

      const startRes = await app.server.inject({
        method: 'POST',
        url: '/billing/subscriptions',
        headers: { authorization: `Bearer ${token}` },
        payload: { planId: 'plus', channel: 'test_pay' },
      });
      const subId = startRes.json().subscriptionId as string;

      await app.server.inject({
        method: 'POST',
        url: `/billing/subscriptions/${subId}/confirm`,
        headers: { authorization: `Bearer ${token}` },
        payload: { receipt: {} },
      });

      // Populate entitlements cache as 'plus'
      const beforeExpiry = await app.billingModule.entitlements.forUser(userId);
      expect(beforeExpiry.planId).toBe('plus');
      expect(await app.cache.get(entitlementsCacheKey(userId))).toBeTruthy();

      // Move current_period_end to the past
      await sql`
        UPDATE public.subscriptions
           SET current_period_end = now() - interval '1 hour'
         WHERE id = ${subId}::uuid
           AND user_id = ${userId}::uuid
      `.execute(app.db);

      const worker = app.recordingsModule.createWorker();
      const expRes = await worker.runSubscriptionExpiry();
      expect(expRes.acquired).toBe(true);
      expect(expRes.expiredCount).toBeGreaterThanOrEqual(1);
      expect(expRes.affectedUserIds).toContain(userId);

      // Cache key was invalidated and user falls back to 'free'
      expect(await app.cache.get(entitlementsCacheKey(userId))).toBeNull();
      const afterExpiry = await app.billingModule.entitlements.forUser(userId);
      expect(afterExpiry.planId).toBe('free');
      expect(afterExpiry.aiEnabled).toBe(false);
    });

    it('sweeps expired credit reservations touching only affected user rows', async () => {
      const affectedUser = await registerUser('sweep-affected');
      const untouchedUser = await registerUser('sweep-untouched');

      const reservationId = await app.creditsModule.reserve(affectedUser.userId, 40);
      await sql`
        UPDATE public.credit_reservations
           SET expires_at = now() - interval '5 minutes'
         WHERE id = ${reservationId}::uuid
           AND user_id = ${affectedUser.userId}::uuid
      `.execute(app.db);

      const worker = app.recordingsModule.createWorker();
      const sweepRes = await worker.runReservationSweep();
      expect(sweepRes.acquired).toBe(true);
      expect(sweepRes.releasedCount).toBeGreaterThanOrEqual(1);
      expect(sweepRes.affectedUserIds).toContain(affectedUser.userId);
      expect(sweepRes.affectedUserIds).not.toContain(untouchedUser.userId);

      const bal = await app.creditsModule.getBalance(affectedUser.userId);
      expect(bal.credits_reserved).toBe(0);
      expect(bal.credits_balance).toBe(100);
    });
  });
});
