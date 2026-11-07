import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { composeApp, composeWorker } from '../apps/api/src/composition.js';
import { FakeTranscriber } from '../apps/api/src/modules/transcription/index.js';
import { FakeAiChatProvider } from '../apps/api/src/modules/ai/index.js';

const execFileAsync = promisify(execFile);

export interface PipelineResult {
  title: string;
  concurrentJobs: number;
  totalDurationMs: number;
  avgDurationPerJobMs: number;
  throughputJobsPerSec: number;
  completedJobs: number;
  failedJobs: number;
  totalNotesGenerated: number;
}

async function generateWavTone(tempDir: string): Promise<Buffer> {
  const filePath = join(tempDir, `tone_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1000:duration=1',
    '-c:a',
    'pcm_u8',
    filePath,
  ]);
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(filePath);
  await rm(filePath, { force: true });
  return buf;
}

export async function runPipelineConcurrentBenchmark(
  concurrency = 16
): Promise<PipelineResult> {
  const scratchDir = await mkdtemp(join(tmpdir(), 'mindspace-load-pipeline-'));
  const toneBuffer = await generateWavTone(scratchDir);

  const fakeTranscriber = new FakeTranscriber();
  fakeTranscriber.reset();
  fakeTranscriber.setHandler((req) => ({
    text: `Meeting transcript part ${req.partIdx ?? 0}: Discussed database hardening and architecture. Action item: deploy production stack.`,
    language: 'en',
  }));
  const fakeChatProvider = new FakeAiChatProvider();

  const mockEntitlements = {
    getEntitlements: async () => ({
      aiEnabled: true,
      maxRecordingMinutes: null,
    }),
  };

  // 1. Compose App & Worker with fake providers
  const app = await composeApp(
    {
      NODE_ENV: 'test',
      RATE_LIMIT_MAX: 500000,
      PIPELINE_WORKERS: concurrency,
      STT_CONCURRENCY: concurrency,
      LLM_CONCURRENCY: concurrency,
    } as any,
    {
      transcriber: fakeTranscriber,
      chatProvider: fakeChatProvider,
      entitlements: mockEntitlements,
    }
  );

  const workerComposition = await composeWorker(
    {
      NODE_ENV: 'test',
      PIPELINE_WORKERS: concurrency,
      STT_CONCURRENCY: concurrency,
      LLM_CONCURRENCY: concurrency,
    },
    {
      transcriber: fakeTranscriber,
      chatProvider: fakeChatProvider,
      entitlements: mockEntitlements,
    }
  );

  await workerComposition.worker.start();
  app.recordingsModule.setEntitlements(mockEntitlements);
  workerComposition.recordingsModule.setEntitlements(mockEntitlements);

  // 2. Register user & space
  const email = `pipeline-user-${Date.now()}@example.com`;
  const signUpRes = await app.server.inject({
    method: 'POST',
    url: '/auth/sign-up',
    payload: { email, password: 'StrongPassword123!', full_name: 'Pipeline Load User' },
  });
  const { access_token, user } = signUpRes.json();
  await app.db.transaction().execute(async (tx) => {
    await app.creditsModule.grant(user.id, 50000, 'purchase', tx);
  });

  const now = new Date();
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await (app.db as any)
    .insertInto('subscriptions')
    .values({
      user_id: user.id,
      plan_id: 'pro',
      status: 'active',
      channel: 'test_pay',
      current_period_start: now,
      current_period_end: nextMonth,
    })
    .execute();

  const spaceRes = await app.server.inject({
    method: 'POST',
    url: '/spaces',
    headers: { authorization: `Bearer ${access_token}` },
    payload: { name: 'Pipeline Benchmark Space', emoji: '🎙️' },
  });
  const spaceId = spaceRes.json().id;

  // 3. Concurrently submit jobs
  const startTime = Date.now();
  const recordingIds: string[] = [];

  for (let i = 0; i < concurrency; i++) {
    const createRes = await app.server.inject({
      method: 'POST',
      url: `/spaces/${spaceId}/recordings`,
      headers: { authorization: `Bearer ${access_token}` },
      payload: { kind: 'meeting', process_mode: 'extract' },
    });
    const recordingId = createRes.json().id;
    recordingIds.push(recordingId);

    // Upload part 0
    await app.server.inject({
      method: 'PUT',
      url: `/recordings/${recordingId}/parts/0`,
      headers: {
        authorization: `Bearer ${access_token}`,
        'content-type': 'audio/wav',
      },
      payload: toneBuffer,
    });
  }

  // Trigger processing for all recordings simultaneously
  await Promise.all(
    recordingIds.map((recId) =>
      app.server.inject({
        method: 'POST',
        url: `/recordings/${recId}/finish`,
        headers: { authorization: `Bearer ${access_token}` },
      })
    )
  );

  // 4. Poll until all recordings reach terminal state (completed / failed)
  const pollIntervalMs = 50;
  const timeoutMs = 30000;
  const deadline = Date.now() + timeoutMs;

  let completedJobs = 0;
  let failedJobs = 0;

  while (Date.now() < deadline) {
    const rows = await app.db
      .selectFrom('recordings')
      .select(['id', 'status'])
      .where('id', 'in', recordingIds)
      .execute();

    completedJobs = rows.filter((r) => r.status === 'completed').length;
    failedJobs = rows.filter((r) => r.status === 'failed').length;

    if (completedJobs + failedJobs >= recordingIds.length) {
      break;
    }
    await new Promise((res) => setTimeout(res, pollIntervalMs));
  }

  const totalDurationMs = Date.now() - startTime;

  // Query notes created for these recordings
  const notes = await app.db
    .selectFrom('sticky_notes')
    .select('id')
    .where('recording_id', 'in', recordingIds)
    .execute();

  // 5. Cleanup
  await workerComposition.close();
  await app.close();
  await rm(scratchDir, { recursive: true, force: true }).catch(() => {});

  return {
    title: 'Concurrent Pipeline against Fake Provider',
    concurrentJobs: concurrency,
    totalDurationMs,
    avgDurationPerJobMs: Math.round(totalDurationMs / concurrency),
    throughputJobsPerSec: Number(((concurrency / totalDurationMs) * 1000).toFixed(2)),
    completedJobs,
    failedJobs,
    totalNotesGenerated: notes.length,
  };
}

if (process.argv[1]?.endsWith('pipeline-concurrent.ts')) {
  console.log('Running Concurrent Pipeline Benchmark...');
  runPipelineConcurrentBenchmark(16)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
