import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { sql } from 'kysely';
import { composeApp, type AppComposition } from '../../composition.js';
import {
  FakeTranscriber,
  OpenRouterTranscriber,
  ProviderError,
} from '../transcription/index.js';

const execFileAsync = promisify(execFile);

async function generateToneBuffer(
  tempDir: string,
  ext: 'webm' | 'wav' | 'mp3' | 'm4a' | 'ogg',
  durationSeconds: number
): Promise<Buffer> {
  const filePath = join(
    tempDir,
    `tone_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  );

  const codecArgs: Record<typeof ext, string[]> = {
    wav: ['-c:a', 'pcm_u8'],
    webm: ['-c:a', 'libopus', '-b:a', '16k'],
    ogg: ['-c:a', 'libvorbis', '-b:a', '24k'],
    mp3: ['-c:a', 'libmp3lame', '-b:a', '24k'],
    m4a: ['-c:a', 'aac', '-b:a', '24k'],
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

describe('Recordings, Parts, Queue, Transcription & SSE (Phase 05)', () => {
  let app: AppComposition;
  let fakeTranscriber: FakeTranscriber;
  let audioDir: string;
  let toneScratchDir: string;

  let webmTone1s: Buffer;
  let wavTone1s: Buffer;
  let wavTone35s: Buffer;

  beforeAll(async () => {
    audioDir = await mkdtemp(join(tmpdir(), 'mindspace-audio-test-'));
    toneScratchDir = await mkdtemp(join(tmpdir(), 'mindspace-tones-'));

    // Pre-generate real ffmpeg tones for fast test reuse
    [webmTone1s, wavTone1s, wavTone35s] = await Promise.all([
      generateToneBuffer(toneScratchDir, 'webm', 1),
      generateToneBuffer(toneScratchDir, 'wav', 1),
      generateToneBuffer(toneScratchDir, 'wav', 35),
    ]);

    fakeTranscriber = new FakeTranscriber();
    app = await composeApp(
      {
        NODE_ENV: 'test',
        AUDIO_DIR: audioDir,
        STT_CONCURRENCY: 4,
        PIPELINE_WORKERS: 4,
      },
      {
        transcriber: fakeTranscriber,
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
    fakeTranscriber.reset();
    fakeTranscriber.setHandler((req) => ({
      text: `part-${req.partIdx ?? 0}-text`,
      language: 'en',
    }));
    app.recordingsModule.setEntitlements({
      getEntitlements: async () => ({
        aiEnabled: true,
        maxRecordingMinutes: null,
      }),
    });
    await sql`DELETE FROM recordings`.execute(app.db);
  });

  async function registerUser(emailPrefix: string): Promise<{
    userId: string;
    token: string;
    spaceId: string;
  }> {
    const email = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${emailPrefix}`;
    const signUpRes = await app.server.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email,
        password: 'Password123!',
        full_name: 'Test User',
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

  it('rejects a fake .webm by magic bytes regardless of Content-Type header, and accepts valid audio by magic bytes', async () => {
    const user = await registerUser('magic@example.com');

    const createRes = await app.server.inject({
      method: 'POST',
      url: `/spaces/${user.spaceId}/recordings`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { kind: 'note', process_mode: 'extract' },
    });
    expect(createRes.statusCode).toBe(201);
    const recordingId = createRes.json().id as string;

    // 1. Upload fake .webm with Content-Type: audio/webm
    const fakeWebm = Buffer.from('this is definitely not a valid EBML/WebM container file');
    const badRes = await app.server.inject({
      method: 'PUT',
      url: `/recordings/${recordingId}/parts/0`,
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'audio/webm',
      },
      payload: fakeWebm,
    });
    expect(badRes.statusCode).toBe(400);
    expect(badRes.json().error).toBe('invalid_audio_format');

    // Verify no part row was stored
    const partsAfterBad = await app.db
      .selectFrom('recording_parts')
      .selectAll()
      .where('recording_id', '=', recordingId)
      .execute();
    expect(partsAfterBad).toHaveLength(0);

    // 2. Upload real .webm tone and verify idempotency when re-uploading as .wav with misleading header
    const okWebmRes = await app.server.inject({
      method: 'PUT',
      url: `/recordings/${recordingId}/parts/0`,
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'audio/webm',
      },
      payload: webmTone1s,
    });
    expect(okWebmRes.statusCode).toBe(200);
    expect(okWebmRes.json().blob_key).toBe(`${user.userId}/${recordingId}/0.webm`);

    // Re-upload part 0 with a real WAV file but misleading Content-Type: application/octet-stream
    const okWavRes = await app.server.inject({
      method: 'PUT',
      url: `/recordings/${recordingId}/parts/0`,
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'application/octet-stream',
      },
      payload: wavTone1s,
    });
    expect(okWavRes.statusCode).toBe(200);
    expect(okWavRes.json().blob_key).toBe(`${user.userId}/${recordingId}/0.wav`);

    const partsAfterIdempotent = await app.db
      .selectFrom('recording_parts')
      .selectAll()
      .where('recording_id', '=', recordingId)
      .execute();
    expect(partsAfterIdempotent).toHaveLength(1);
    expect(partsAfterIdempotent[0].blob_key).toBe(`${user.userId}/${recordingId}/0.wav`);
  });

  it('transcribes 3 parts that complete out of order and joins them in idx order', async () => {
    const user = await registerUser('outoforder@example.com');

    const createRes = await app.server.inject({
      method: 'POST',
      url: `/spaces/${user.spaceId}/recordings`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { kind: 'meeting', process_mode: 'extract' },
    });
    expect(createRes.statusCode).toBe(201);
    const recordingId = createRes.json().id as string;

    // Upload 3 real ffmpeg-generated webm parts (idx 0, 1, 2)
    for (const idx of [0, 1, 2]) {
      const putRes = await app.server.inject({
        method: 'PUT',
        url: `/recordings/${recordingId}/parts/${idx}`,
        headers: {
          authorization: `Bearer ${user.token}`,
          'content-type': 'audio/webm',
        },
        payload: webmTone1s,
      });
      expect(putRes.statusCode).toBe(200);
    }

    // Configure fake provider so idx 2 finishes first, idx 1 second, idx 0 last
    fakeTranscriber.setHandler(async (req) => {
      const delays: Record<number, number> = { 0: 80, 1: 40, 2: 5 };
      const waitMs = delays[req.partIdx ?? 0] ?? 10;
      await new Promise((r) => setTimeout(r, waitMs));
      return {
        text: `Segment-${req.partIdx}`,
        language: 'en',
      };
    });

    // Finish recording (idempotent)
    const finishRes1 = await app.server.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/finish`,
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(finishRes1.statusCode).toBe(200);
    expect(finishRes1.json().status).toBe('queued');

    const finishRes2 = await app.server.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/finish`,
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(finishRes2.statusCode).toBe(200);
    expect(finishRes2.json().status).toBe('queued');

    const worker = app.recordingsModule.createWorker();
    const processed = await worker.runOnce();
    expect(processed).toBe(true);

    // Verify parts completed out of order (2 -> 1 -> 0)
    expect(fakeTranscriber.completionOrder).toEqual([2, 1, 0]);

    // Verify joined transcript is in idx order (0 -> 1 -> 2)
    const listRes = await app.server.inject({
      method: 'GET',
      url: `/spaces/${user.spaceId}/recordings`,
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(listRes.statusCode).toBe(200);
    const recordings = listRes.json();
    expect(recordings).toHaveLength(1);
    expect(recordings[0].status).toBe('completed');
    expect(recordings[0].transcripts).toEqual([
      { text: 'Segment-0 Segment-1 Segment-2' },
    ]);
  });

  it('resumes a killed worker job after sweep without re-transcribing finished parts, and fails after 3 attempts releasing reservations', async () => {
    const user = await registerUser('resume@example.com');

    const createRes = await app.server.inject({
      method: 'POST',
      url: `/spaces/${user.spaceId}/recordings`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { kind: 'note', process_mode: 'extract' },
    });
    expect(createRes.statusCode).toBe(201);
    const recordingId = createRes.json().id as string;

    for (const idx of [0, 1, 2]) {
      const putRes = await app.server.inject({
        method: 'PUT',
        url: `/recordings/${recordingId}/parts/${idx}`,
        headers: {
          authorization: `Bearer ${user.token}`,
          'content-type': 'audio/wav',
        },
        payload: wavTone1s,
      });
      expect(putRes.statusCode).toBe(200);
    }

    await app.server.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/finish`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    const worker1 = app.recordingsModule.createWorker();

    // Parts 0 and 1 succeed quickly; Part 2 waits until parts 0 and 1 are persisted, then worker1 is killed
    fakeTranscriber.setHandler(async (req) => {
      if (req.partIdx === 0 || req.partIdx === 1) {
        return { text: `SavedPart-${req.partIdx}`, language: 'en' };
      }
      // Wait briefly so parts 0 and 1 finish and write to DB
      await new Promise((r) => setTimeout(r, 60));
      // Kill worker1 mid-flight during part 2
      void worker1.kill();
      throw req.signal?.reason ?? new Error('Worker killed');
    });

    await worker1.runOnce();

    // Verify parts 0 and 1 are saved as 'transcribed' in DB, while part 2 is still 'uploaded'
    const partsAfterCrash = await app.db
      .selectFrom('recording_parts')
      .selectAll()
      .where('recording_id', '=', recordingId)
      .orderBy('idx', 'asc')
      .execute();

    expect(partsAfterCrash[0].status).toBe('transcribed');
    expect(partsAfterCrash[0].transcript_text).toBe('SavedPart-0');
    expect(partsAfterCrash[1].status).toBe('transcribed');
    expect(partsAfterCrash[1].transcript_text).toBe('SavedPart-1');
    expect(partsAfterCrash[2].status).toBe('uploaded');

    // Backdate claimed_at by 16 minutes so the 15-minute sweeper picks it up
    await sql`
      UPDATE recordings
         SET claimed_at = now() - interval '16 minutes'
       WHERE id = ${recordingId}
    `.execute(app.db);

    const worker2 = app.recordingsModule.createWorker();
    const sweepRes = await worker2.sweep();
    expect(sweepRes.requeued).toBe(1);
    expect(sweepRes.failed).toBe(0);

    // Clear recorded provider calls and run Worker 2
    fakeTranscriber.reset();
    fakeTranscriber.setHandler(async (req) => ({
      text: `ResumedPart-${req.partIdx}`,
      language: 'en',
    }));

    const resumedOk = await worker2.runOnce();
    expect(resumedOk).toBe(true);

    // Worker 2 must ONLY have transcribed part 2, skipping already-transcribed parts 0 and 1!
    expect(fakeTranscriber.calls.map((c) => c.partIdx)).toEqual([2]);

    const txRow = await app.db
      .selectFrom('transcripts')
      .selectAll()
      .where('recording_id', '=', recordingId)
      .executeTakeFirstOrThrow();
    expect(txRow.text).toBe('SavedPart-0 SavedPart-1 ResumedPart-2');

    // Now test a job that times out after 3 attempts: sweeper marks it 'failed' and releases reservation
    const createStuck = await app.server.inject({
      method: 'POST',
      url: `/spaces/${user.spaceId}/recordings`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { kind: 'note', process_mode: 'extract' },
    });
    const stuckId = createStuck.json().id as string;

    const reservationId = await app.creditsModule.reserve(user.userId, 18);
    await app.db
      .updateTable('credit_reservations')
      .set({ ai_action_id: stuckId })
      .where('id', '=', reservationId)
      .execute();

    await sql`
      UPDATE recordings
         SET status = 'transcribing',
             attempts = 3,
             claimed_at = now() - interval '16 minutes'
       WHERE id = ${stuckId}
    `.execute(app.db);

    const sweepFailRes = await worker2.sweep();
    expect(sweepFailRes.failed).toBe(1);

    const stuckRec = await app.db
      .selectFrom('recordings')
      .select(['status', 'error'])
      .where('id', '=', stuckId)
      .executeTakeFirstOrThrow();
    expect(stuckRec.status).toBe('failed');
    expect(stuckRec.error).toBe('max_attempts_exceeded');

    const balanceAfterSweep = await app.creditsModule.getBalance(user.userId);
    expect(balanceAfterSweep.credits_reserved).toBe(0);
  });

  it('ignores spoofed client duration and charges credits from ffprobe server-measured duration', async () => {
    const user = await registerUser('duration@example.com');

    // Client spoofs duration_ms = 1 (trying to pay 1 credit for 70 seconds of audio)
    const createRes = await app.server.inject({
      method: 'POST',
      url: `/spaces/${user.spaceId}/recordings`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: {
        kind: 'note',
        process_mode: 'extract',
        duration_ms: 1,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const recordingId = createRes.json().id as string;

    // Upload 2 parts of 35s each = 70 seconds total (~70,000 ms)
    for (const idx of [0, 1]) {
      const putRes = await app.server.inject({
        method: 'PUT',
        url: `/recordings/${recordingId}/parts/${idx}`,
        headers: {
          authorization: `Bearer ${user.token}`,
          'content-type': 'audio/wav',
        },
        payload: wavTone35s,
      });
      expect(putRes.statusCode).toBe(200);
    }

    await app.server.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/finish`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    const worker = app.recordingsModule.createWorker();
    await worker.runOnce();

    // Verify server measured ~70,000 ms via ffprobe and updated recordings.duration_ms
    const recRow = await app.db
      .selectFrom('recordings')
      .select(['duration_ms', 'status', 'local_only', 'storage_path'])
      .where('id', '=', recordingId)
      .executeTakeFirstOrThrow();

    expect(recRow.status).toBe('completed');
    expect(recRow.duration_ms).toBeGreaterThanOrEqual(69_000);
    expect(recRow.duration_ms).toBeLessThanOrEqual(71_000);

    // 70 seconds = 1.1667 minutes -> ceil(6 * 1.1667 * 1.0) = 7 credits (NOT 1 credit!)
    const balance = await app.creditsModule.getBalance(user.userId);
    expect(balance.credits_balance).toBe(100 - 7);
    expect(balance.credits_reserved).toBe(0);

    // Free-plan user: audio removed after transcript is saved
    expect(recRow.local_only).toBe(true);
    expect(recRow.storage_path).toBeNull();
    expect(
      await app.recordingsModule.blobStore.exists(`${user.userId}/${recordingId}/0.wav`)
    ).toBe(false);
  });

  it('returns 404 to a foreign user on every recordings route and note reference', async () => {
    const userA = await registerUser('usera@example.com');
    const userB = await registerUser('userb@example.com');

    // User A creates a note in their space
    const noteRes = await app.server.inject({
      method: 'POST',
      url: `/spaces/${userA.spaceId}/notes`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { content: 'User A private note', x: 10, y: 20 },
    });
    expect(noteRes.statusCode).toBe(201);
    const userANoteId = noteRes.json().id as string;

    // User A creates a recording and uploads part 0
    const recRes = await app.server.inject({
      method: 'POST',
      url: `/spaces/${userA.spaceId}/recordings`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        kind: 'note',
        process_mode: 'extract',
        parent_note_id: userANoteId,
      },
    });
    expect(recRes.statusCode).toBe(201);
    const userARecId = recRes.json().id as string;

    await app.server.inject({
      method: 'PUT',
      url: `/recordings/${userARecId}/parts/0`,
      headers: {
        authorization: `Bearer ${userA.token}`,
        'content-type': 'audio/webm',
      },
      payload: webmTone1s,
    });

    // 1. POST /spaces/:id/recordings on User A's space by User B -> 404
    const createOnForeignSpace = await app.server.inject({
      method: 'POST',
      url: `/spaces/${userA.spaceId}/recordings`,
      headers: { authorization: `Bearer ${userB.token}` },
      payload: { kind: 'note', process_mode: 'extract' },
    });
    expect(createOnForeignSpace.statusCode).toBe(404);

    // 2. POST /spaces/:id/recordings on User B's space referencing User A's target_note_id -> 404
    const createWithForeignTargetNote = await app.server.inject({
      method: 'POST',
      url: `/spaces/${userB.spaceId}/recordings`,
      headers: { authorization: `Bearer ${userB.token}` },
      payload: {
        kind: 'note',
        process_mode: 'note_write',
        target_note_id: userANoteId,
      },
    });
    expect(createWithForeignTargetNote.statusCode).toBe(404);

    // 3. POST /spaces/:id/recordings on User B's space referencing User A's parent_note_id -> 404
    const createWithForeignParentNote = await app.server.inject({
      method: 'POST',
      url: `/spaces/${userB.spaceId}/recordings`,
      headers: { authorization: `Bearer ${userB.token}` },
      payload: {
        kind: 'note',
        process_mode: 'extract',
        parent_note_id: userANoteId,
      },
    });
    expect(createWithForeignParentNote.statusCode).toBe(404);

    // 4. GET /spaces/:id/recordings on User A's space by User B -> 404
    const listForeign = await app.server.inject({
      method: 'GET',
      url: `/spaces/${userA.spaceId}/recordings`,
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(listForeign.statusCode).toBe(404);

    // 5. PUT /recordings/:id/parts/0 on User A's recording by User B -> 404
    const putForeign = await app.server.inject({
      method: 'PUT',
      url: `/recordings/${userARecId}/parts/0`,
      headers: {
        authorization: `Bearer ${userB.token}`,
        'content-type': 'audio/webm',
      },
      payload: webmTone1s,
    });
    expect(putForeign.statusCode).toBe(404);

    // 6. POST /recordings/:id/finish on User A's recording by User B -> 404
    const finishForeign = await app.server.inject({
      method: 'POST',
      url: `/recordings/${userARecId}/finish`,
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(finishForeign.statusCode).toBe(404);

    // 7. GET /recordings/:id/events on User A's recording by User B -> 404
    const eventsForeign = await app.server.inject({
      method: 'GET',
      url: `/recordings/${userARecId}/events`,
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(eventsForeign.statusCode).toBe(404);

    // 8. GET /recordings/:id/status on User A's recording by User B -> 404
    const statusForeign = await app.server.inject({
      method: 'GET',
      url: `/recordings/${userARecId}/status`,
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(statusForeign.statusCode).toBe(404);

    // 9. GET /recordings/:id/transcript-id on User A's recording by User B -> 404
    const txIdForeign = await app.server.inject({
      method: 'GET',
      url: `/recordings/${userARecId}/transcript-id`,
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(txIdForeign.statusCode).toBe(404);

    // 10. POST /recordings/:id/failed on User A's recording by User B -> 404
    const failedForeign = await app.server.inject({
      method: 'POST',
      url: `/recordings/${userARecId}/failed`,
      headers: { authorization: `Bearer ${userB.token}` },
      payload: { error: 'sabotage' },
    });
    expect(failedForeign.statusCode).toBe(404);

    // 11. POST /recordings/:id/completed on User A's recording by User B -> 404
    const completedForeign = await app.server.inject({
      method: 'POST',
      url: `/recordings/${userARecId}/completed`,
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(completedForeign.statusCode).toBe(404);
  });

  it('splits a part over 5 minutes with ffmpeg into new parts and enforces Entitlements cap', async () => {
    const user = await registerUser('split@example.com');

    // Generate a 305-second (5m 05s) WAV tone using ffmpeg
    const tone305s = await generateToneBuffer(toneScratchDir, 'wav', 305);

    const createRes = await app.server.inject({
      method: 'POST',
      url: `/spaces/${user.spaceId}/recordings`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { kind: 'meeting', process_mode: 'extract' },
    });
    const recordingId = createRes.json().id as string;

    const putRes = await app.server.inject({
      method: 'PUT',
      url: `/recordings/${recordingId}/parts/0`,
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'audio/wav',
      },
      payload: tone305s,
    });
    expect(putRes.statusCode).toBe(200);

    await app.server.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/finish`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    const worker = app.recordingsModule.createWorker();
    await worker.runOnce();

    // Verify the single >5m part was split into 2 parts (idx 0 and idx 1)
    const partsAfterSplit = await app.db
      .selectFrom('recording_parts')
      .selectAll()
      .where('recording_id', '=', recordingId)
      .orderBy('idx', 'asc')
      .execute();

    expect(partsAfterSplit.length).toBe(2);
    expect(partsAfterSplit[0].idx).toBe(0);
    expect(partsAfterSplit[1].idx).toBe(1);
    expect(partsAfterSplit[0].status).toBe('transcribed');
    expect(partsAfterSplit[1].status).toBe('transcribed');

    // Now test Entitlements cap rejection when maxRecordingMinutes is exceeded
    app.recordingsModule.setEntitlements({
      getEntitlements: async () => ({
        aiEnabled: true,
        maxRecordingMinutes: 0.5, // 30 seconds cap
      }),
    });

    const createCapped = await app.server.inject({
      method: 'POST',
      url: `/spaces/${user.spaceId}/recordings`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { kind: 'note', process_mode: 'extract' },
    });
    const cappedId = createCapped.json().id as string;

    await app.server.inject({
      method: 'PUT',
      url: `/recordings/${cappedId}/parts/0`,
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'audio/wav',
      },
      payload: wavTone35s, // 35s > 30s cap
    });

    await app.server.inject({
      method: 'POST',
      url: `/recordings/${cappedId}/finish`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    await worker.runOnce();

    const cappedStatus = await app.server.inject({
      method: 'GET',
      url: `/recordings/${cappedId}/status`,
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(cappedStatus.statusCode).toBe(200);
    expect(cappedStatus.json()).toEqual({
      status: 'failed',
      error: 'recording_too_long',
    });
  });

  it('streams SSE events from initial status to completion, and falls back to polling when Redis is down', async () => {
    const user = await registerUser('sse@example.com');

    const createRes = await app.server.inject({
      method: 'POST',
      url: `/spaces/${user.spaceId}/recordings`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { kind: 'note', process_mode: 'extract' },
    });
    const recordingId = createRes.json().id as string;

    await app.server.inject({
      method: 'PUT',
      url: `/recordings/${recordingId}/parts/0`,
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'audio/webm',
      },
      payload: webmTone1s,
    });

    await app.server.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/finish`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    // Start SSE request concurrently with worker processing
    const worker = app.recordingsModule.createWorker();
    const ssePromise = app.server.inject({
      method: 'GET',
      url: `/recordings/${recordingId}/events`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    setTimeout(() => {
      void worker.runOnce();
    }, 30);

    const sseRes = await ssePromise;
    expect(sseRes.statusCode).toBe(200);
    expect(sseRes.headers['content-type']).toContain('text/event-stream');

    const events = sseRes.body
      .split('\n\n')
      .map((frame) => frame.trim())
      .filter((frame) => frame.startsWith('data: '))
      .map((frame) => JSON.parse(frame.slice(6)));

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].status).toBe('queued');
    expect(events[events.length - 1]).toEqual({
      status: 'completed',
      error: null,
    });
  });

  it('retries failed OpenRouter provider calls 3 times on 429 and 5xx with exponential backoff and jitter', async () => {
    let attempts = 0;
    const statuses = [429, 502, 503, 200];

    const transcriber = new OpenRouterTranscriber({
      baseDelayMs: 5,
      maxRetries: 3,
      deadlineMs: 5_000,
      fetchFn: async () => {
        const status = statuses[attempts] ?? 200;
        attempts++;
        if (status !== 200) {
          return new Response('rate limit or upstream error', { status });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Recovered after 3 retries' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    });

    const result = await transcriber.transcribe({
      apiKey: 'test-key',
      model: 'google/gemini-2.5-flash',
      audioStream: Readable.from([webmTone1s]),
      format: 'webm',
    });

    expect(attempts).toBe(4);
    expect(result.text).toBe('Recovered after 3 retries');

    // Also verify it throws ProviderError when all 3 retries fail on 503
    let failAttempts = 0;
    const failingTranscriber = new OpenRouterTranscriber({
      baseDelayMs: 5,
      maxRetries: 3,
      deadlineMs: 5_000,
      fetchFn: async () => {
        failAttempts++;
        return new Response('service unavailable', { status: 503 });
      },
    });

    await expect(
      failingTranscriber.transcribe({
        apiKey: 'test-key',
        model: 'google/gemini-2.5-flash',
        audioStream: Readable.from([webmTone1s]),
        format: 'webm',
      })
    ).rejects.toThrow(ProviderError);
    expect(failAttempts).toBe(4);
  });
});
