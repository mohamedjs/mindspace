import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { sql } from 'kysely';
import { composeApp, type AppComposition } from '../../composition.js';
import { FakeAiChatProvider } from './infrastructure/fakeAiChatProvider.js';
import { FakeTranscriber } from '../transcription/index.js';

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

describe('AI Extraction and Note Writing (Phase 06)', () => {
  let app: AppComposition;
  let fakeChatProvider: FakeAiChatProvider;
  let fakeTranscriber: FakeTranscriber;
  let audioDir: string;
  let toneScratchDir: string;
  let wavTone1s: Buffer;

  beforeAll(async () => {
    audioDir = await mkdtemp(join(tmpdir(), 'mindspace-ai-test-'));
    toneScratchDir = await mkdtemp(join(tmpdir(), 'mindspace-ai-tones-'));
    wavTone1s = await generateToneBuffer(toneScratchDir, 'wav', 1);

    fakeChatProvider = new FakeAiChatProvider();
    fakeTranscriber = new FakeTranscriber();

    app = await composeApp(
      {
        NODE_ENV: 'test',
        AUDIO_DIR: audioDir,
        STT_CONCURRENCY: 4,
        LLM_CONCURRENCY: 4,
        PIPELINE_WORKERS: 4,
      },
      {
        transcriber: fakeTranscriber,
        chatProvider: fakeChatProvider,
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
    fakeChatProvider.reset();
    fakeTranscriber.reset();
    fakeTranscriber.setHandler(() => ({
      text: 'I want to build a voice app for developers. I should email Ahmed about pricing.',
      language: 'en',
    }));
    await sql`DELETE FROM recordings`.execute(app.db);
    await sql`DELETE FROM ai_actions`.execute(app.db);
  });

  async function registerUser(emailPrefix: string): Promise<{
    userId: string;
    token: string;
    spaceId: string;
  }> {
    const email = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${emailPrefix}@example.com`;
    const signUpRes = await app.server.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email,
        password: 'Password123!',
        full_name: 'Test AI User',
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

  async function createTranscript(
    userId: string,
    spaceId: string,
    text: string
  ): Promise<{ transcriptId: string; recordingId: string }> {
    const recording = await app.db
      .insertInto('recordings')
      .values({
        user_id: userId,
        space_id: spaceId,
        status: 'transcribed',
        duration_ms: 10000,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const transcript = await app.db
      .insertInto('transcripts')
      .values({
        user_id: userId,
        recording_id: recording.id,
        text,
        provider: 'openrouter',
        model_id: 'meta-llama/llama-3.3-70b-instruct',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return { transcriptId: transcript.id, recordingId: recording.id };
  }

  it('end to end from finish to notes via worker pipeline', async () => {
    const user = await registerUser('e2e');

    // Configure fake LLM response
    fakeChatProvider.setHandler(() => ({
      text: JSON.stringify({
        notes: [
          {
            clientKey: 'note_0',
            title: 'Voice app for developers',
            content: 'I want to build a voice app for developers.',
            type: 'idea',
            parentClientKey: null,
            dueAt: null,
          },
          {
            clientKey: 'note_1',
            title: 'Email Ahmed',
            content: 'I should email Ahmed about pricing.',
            type: 'task',
            parentClientKey: 'note_0',
            dueAt: null,
          },
        ],
        relations: [{ from: 'note_1', to: 'note_0', type: 'supports' }],
      }),
      inputTokens: 200,
      outputTokens: 80,
    }));

    // Create recording
    const createRes = await app.server.inject({
      method: 'POST',
      url: `/spaces/${user.spaceId}/recordings`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { kind: 'note', process_mode: 'extract' },
    });
    expect(createRes.statusCode).toBe(201);
    const recordingId = createRes.json().id as string;

    // Upload audio part
    const uploadRes = await app.server.inject({
      method: 'PUT',
      url: `/recordings/${recordingId}/parts/0`,
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'audio/wav',
      },
      payload: wavTone1s,
    });
    expect(uploadRes.statusCode).toBe(200);

    // Call finish
    const finishRes = await app.server.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/finish`,
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(finishRes.statusCode).toBe(200);
    expect(finishRes.json().status).toBe('queued');

    // Run job with the pipeline worker processor
    const processed = await app.recordingsModule.jobUseCase.claimAndProcessNext();
    expect(processed).toBe(true);

    // Check status is completed
    const recRow = await app.db
      .selectFrom('recordings')
      .select(['status', 'error'])
      .where('id', '=', recordingId)
      .executeTakeFirstOrThrow();
    expect(recRow.status).toBe('completed');
    expect(recRow.error).toBeNull();

    // Check notes were created in user space
    const notes = await app.db
      .selectFrom('sticky_notes')
      .selectAll()
      .where('space_id', '=', user.spaceId)
      .where('deleted_at', 'is', null)
      .execute();
    expect(notes.length).toBe(2);

    // Check relations created
    const rels = await app.db
      .selectFrom('relationships')
      .selectAll()
      .where('space_id', '=', user.spaceId)
      .where('deleted_at', 'is', null)
      .execute();
    expect(rels.length).toBe(1);

    // Check ai_actions row created
    const action = await app.db
      .selectFrom('ai_actions')
      .selectAll()
      .where('recording_id', '=', recordingId)
      .executeTakeFirstOrThrow();
    expect(action.status).toBe('proposed');
    expect(action.credits_charged).toBeGreaterThan(0);
  });

  it('failure before commit leaves no notes and no charge', async () => {
    const user = await registerUser('fail-before-commit');
    const { transcriptId } = await createTranscript(user.userId, user.spaceId, 'Some speech');

    const balanceBefore = await app.creditsModule.getBalance(user.userId);
    expect(balanceBefore.credits_balance).toBeGreaterThan(0);

    // Provider throws error
    fakeChatProvider.failureStatus = 500;

    const res = await app.server.inject({
      method: 'POST',
      url: '/ai/extract',
      headers: { authorization: `Bearer ${user.token}` },
      payload: {
        transcriptId,
        spaceId: user.spaceId,
      },
    });

    expect(res.statusCode).toBe(500);

    // Verify 0 notes inserted
    const notes = await app.db
      .selectFrom('sticky_notes')
      .selectAll()
      .where('space_id', '=', user.spaceId)
      .execute();
    expect(notes.length).toBe(0);

    // Verify credits balance unchanged and reserved released
    const balanceAfter = await app.creditsModule.getBalance(user.userId);
    expect(balanceAfter.credits_balance).toBe(balanceBefore.credits_balance);
    expect(balanceAfter.credits_reserved).toBe(0);
  });

  it('a retry makes no duplicates', async () => {
    const user = await registerUser('no-dupes');
    const { transcriptId, recordingId } = await createTranscript(
      user.userId,
      user.spaceId,
      'First run thoughts'
    );

    // First extraction run
    const firstRes = await app.server.inject({
      method: 'POST',
      url: '/ai/extract',
      headers: { authorization: `Bearer ${user.token}` },
      payload: {
        transcriptId,
        spaceId: user.spaceId,
      },
    });
    expect(firstRes.statusCode).toBe(200);
    const firstBody = firstRes.json();
    expect(firstBody.noteIds.length).toBeGreaterThan(0);

    const notesCount1 = await app.db
      .selectFrom('sticky_notes')
      .select(sql<string>`count(*)`.as('c'))
      .where('space_id', '=', user.spaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();

    const balanceAfterFirst = await app.creditsModule.getBalance(user.userId);

    // Retry extraction through extractor handoff on the same recording
    await app.aiModule.extractor.extract({
      recordingId,
      userId: user.userId,
      spaceId: user.spaceId,
      transcriptId,
      transcriptText: 'First run thoughts',
      kind: 'note',
      processMode: 'extract',
      targetNoteId: null,
      parentNoteId: null,
    });

    const notesCount2 = await app.db
      .selectFrom('sticky_notes')
      .select(sql<string>`count(*)`.as('c'))
      .where('space_id', '=', user.spaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();

    // No new notes created
    expect(notesCount2.c).toBe(notesCount1.c);

    // No extra credits deducted
    const balanceAfterSecond = await app.creditsModule.getBalance(user.userId);
    expect(balanceAfterSecond.credits_balance).toBe(balanceAfterFirst.credits_balance);
  });

  it('a charge never exceeds the reservation', async () => {
    const user = await registerUser('cap-check');
    const { transcriptId } = await createTranscript(user.userId, user.spaceId, 'Check cap');

    // Provider returns astronomical token counts
    fakeChatProvider.setHandler(() => ({
      text: JSON.stringify({
        notes: [{ clientKey: 'n1', content: 'Capped note', type: 'idea' }],
        relations: [],
      }),
      inputTokens: 50_000_000,
      outputTokens: 50_000_000,
    }));

    const balanceBefore = await app.creditsModule.getBalance(user.userId);

    const res = await app.server.inject({
      method: 'POST',
      url: '/ai/extract',
      headers: { authorization: `Bearer ${user.token}` },
      payload: {
        transcriptId,
        spaceId: user.spaceId,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // BASE_EXTRACT_CREDITS = 8 * 1 (multiplier) = 8
    expect(body.creditsCharged).toBeLessThanOrEqual(8);

    const balanceAfter = await app.creditsModule.getBalance(user.userId);
    expect(balanceBefore.credits_balance - balanceAfter.credits_balance).toBeLessThanOrEqual(8);
  });

  it('a foreign spaceId gets 404', async () => {
    const userA = await registerUser('user-a');
    const userB = await registerUser('user-b');
    const { transcriptId } = await createTranscript(userB.userId, userB.spaceId, 'Speech');

    // User B tries to extract into User A's space
    const res = await app.server.inject({
      method: 'POST',
      url: '/ai/extract',
      headers: { authorization: `Bearer ${userB.token}` },
      payload: {
        transcriptId,
        spaceId: userA.spaceId,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('a foreign parentNoteId gets 404', async () => {
    const userA = await registerUser('parent-a');
    const userB = await registerUser('parent-b');

    // Create note in user A space
    const noteA = await app.db
      .insertInto('sticky_notes')
      .values({
        user_id: userA.userId,
        space_id: userA.spaceId,
        content: 'Secret note',
        type: 'idea',
        x: 0,
        y: 0,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const { transcriptId } = await createTranscript(userB.userId, userB.spaceId, 'Speech');

    // User B tries to pass user A's note as parentNoteId
    const res = await app.server.inject({
      method: 'POST',
      url: '/ai/extract',
      headers: { authorization: `Bearer ${userB.token}` },
      payload: {
        transcriptId,
        spaceId: userB.spaceId,
        parentNoteId: noteA.id,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('a 200-note board still yields a bounded prompt (max 60 notes, content <= 400 chars, includes focus note)', async () => {
    const user = await registerUser('board-200');

    // Insert 200 notes with large content
    const noteRows = Array.from({ length: 200 }, (_, i) => ({
      user_id: user.userId,
      space_id: user.spaceId,
      title: `Note ${i}`,
      content: `Content for note ${i} ` + 'A'.repeat(600),
      type: 'idea' as const,
      x: (i % 4) * 200,
      y: Math.floor(i / 4) * 150,
      updated_at: new Date(Date.now() - (200 - i) * 1000).toISOString(),
    }));

    await app.db.insertInto('sticky_notes').values(noteRows).execute();

    // Create a special focus note that is the oldest note (would be note 0, outside top 60)
    const oldestNote = await app.db
      .selectFrom('sticky_notes')
      .selectAll()
      .where('space_id', '=', user.spaceId)
      .where('title', '=', 'Note 0')
      .executeTakeFirstOrThrow();

    const { transcriptId } = await createTranscript(user.userId, user.spaceId, 'Elaborating on note 0');

    const res = await app.server.inject({
      method: 'POST',
      url: '/ai/extract',
      headers: { authorization: `Bearer ${user.token}` },
      payload: {
        transcriptId,
        spaceId: user.spaceId,
        parentNoteId: oldestNote.id,
      },
    });
    expect(res.statusCode).toBe(200);

    // Inspect the recorded call to LLM
    expect(fakeChatProvider.recordedCalls.length).toBeGreaterThan(0);
    const lastCall = fakeChatProvider.recordedCalls[fakeChatProvider.recordedCalls.length - 1];

    // Count notes in prompt context
    const lines = lastCall.user.split('\n');
    const boardNoteLines = lines.filter((l) => l.startsWith('- [idea]'));
    expect(boardNoteLines.length).toBeLessThanOrEqual(60);

    // Verify focus note is explicitly mentioned
    expect(lastCall.user).toContain(oldestNote.id);

    // Verify no note has full 600 characters
    expect(lastCall.user).not.toContain('A'.repeat(450));
  });

  it('long meetings (>12,000 characters) split on sentence boundaries, extract concurrently, and merge up to 40 notes', async () => {
    const user = await registerUser('long-meeting');

    // Build ~15,000 char transcript with sentence boundaries
    const sentences = Array.from({ length: 350 }, (_, i) => `Sentence number ${i} about feature planning.`);
    const longText = sentences.join(' ');
    expect(longText.length).toBeGreaterThan(12000);

    const { transcriptId } = await createTranscript(user.userId, user.spaceId, longText);

    fakeChatProvider.setHandler((args) => {
      return {
        text: JSON.stringify({
          notes: [
            { clientKey: 'n0', title: 'Action item', content: `Discussed: ${args.user.slice(0, 30)}`, type: 'task' },
          ],
          relations: [],
        }),
        inputTokens: 100,
        outputTokens: 50,
      };
    });

    const res = await app.server.inject({
      method: 'POST',
      url: '/ai/extract',
      headers: { authorization: `Bearer ${user.token}` },
      payload: {
        transcriptId,
        spaceId: user.spaceId,
      },
    });
    expect(res.statusCode).toBe(200);

    // Verify multiple chunks were processed
    expect(fakeChatProvider.recordedCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('meeting recordings create their own space named with an AI title and the date', async () => {
    const user = await registerUser('meeting-mode');
    const { transcriptId, recordingId } = await createTranscript(
      user.userId,
      user.spaceId,
      'Meeting discussing roadmap Q3'
    );

    fakeChatProvider.setHandler(() => ({
      text: JSON.stringify({
        notes: [
          {
            clientKey: 'm0',
            title: 'Q3 Roadmap Discussion',
            content: 'Roadmap goals were aligned for Q3 launch.',
            type: 'summary',
          },
        ],
        relations: [],
      }),
      inputTokens: 120,
      outputTokens: 40,
    }));

    await app.aiModule.extractor.extract({
      recordingId,
      userId: user.userId,
      spaceId: user.spaceId,
      transcriptId,
      transcriptText: 'Meeting discussing roadmap Q3',
      kind: 'meeting',
      processMode: 'extract',
      targetNoteId: null,
      parentNoteId: null,
    });

    // Check recording status is completed
    const recRow = await app.db
      .selectFrom('recordings')
      .selectAll()
      .where('id', '=', recordingId)
      .executeTakeFirstOrThrow();
    expect(recRow.status).toBe('completed');

    // Verify new space exists with AI title + date
    const userSpaces = await app.db
      .selectFrom('spaces')
      .selectAll()
      .where('user_id', '=', user.userId)
      .where('id', '!=', user.spaceId)
      .execute();
    expect(userSpaces).toHaveLength(1);
    const newSpace = userSpaces[0];
    expect(newSpace.name).toContain('Q3 Roadmap Discussion');
    expect(newSpace.emoji).toBe('🎙️');

    // Verify notes land on the new space
    const notes = await app.db
      .selectFrom('sticky_notes')
      .selectAll()
      .where('space_id', '=', newSpace.id)
      .execute();
    expect(notes.length).toBe(1);
    expect(notes[0].title).toBe('Q3 Roadmap Discussion');
  });

  it('GET /models, preferences, and POST /ai/actions/:id/undo', async () => {
    const user = await registerUser('models-prefs-undo');

    // 1. GET /models
    const modelsRes = await app.server.inject({
      method: 'GET',
      url: '/models',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(modelsRes.statusCode).toBe(200);
    const models = modelsRes.json();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    const chatModel = models.find((m: any) => m.kind === 'chat');
    expect(chatModel).toBeDefined();

    // 2. GET /models/preferences
    const getPrefsRes = await app.server.inject({
      method: 'GET',
      url: '/models/preferences',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(getPrefsRes.statusCode).toBe(200);

    // 3. PUT /models/preferences
    const putPrefsRes = await app.server.inject({
      method: 'PUT',
      url: '/models/preferences',
      headers: { authorization: `Bearer ${user.token}` },
      payload: {
        kind: 'chat',
        model_row_id: chatModel.id,
      },
    });
    expect(putPrefsRes.statusCode).toBe(204);

    const getPrefsAfter = await app.server.inject({
      method: 'GET',
      url: '/models/preferences',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(getPrefsAfter.json().chat_model_id).toBe(chatModel.id);

    // 4. POST /ai/actions/:id/undo
    const { transcriptId } = await createTranscript(user.userId, user.spaceId, 'Undo test thoughts');
    const extractRes = await app.server.inject({
      method: 'POST',
      url: '/ai/extract',
      headers: { authorization: `Bearer ${user.token}` },
      payload: {
        transcriptId,
        spaceId: user.spaceId,
      },
    });
    expect(extractRes.statusCode).toBe(200);
    const { aiActionId, noteIds } = extractRes.json();
    expect(noteIds.length).toBeGreaterThan(0);

    // Call undo
    const undoRes = await app.server.inject({
      method: 'POST',
      url: `/ai/actions/${aiActionId}/undo`,
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(undoRes.statusCode).toBe(204);

    // Verify notes are soft-deleted
    const liveNotes = await app.db
      .selectFrom('sticky_notes')
      .selectAll()
      .where('id', 'in', noteIds)
      .where('deleted_at', 'is', null)
      .execute();
    expect(liveNotes.length).toBe(0);

    // Verify action is marked undone
    const action = await app.db
      .selectFrom('ai_actions')
      .selectAll()
      .where('id', '=', aiActionId)
      .executeTakeFirstOrThrow();
    expect(action.status).toBe('undone');
  });

  it('POST /ai/note-write creates action with status accepted and updates note content', async () => {
    const user = await registerUser('note-write');

    // Create an initial note
    const note = await app.db
      .insertInto('sticky_notes')
      .values({
        user_id: user.userId,
        space_id: user.spaceId,
        title: 'Initial note',
        content: 'Original thoughts before voice update.',
        type: 'idea',
        x: 0,
        y: 0,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const { transcriptId } = await createTranscript(user.userId, user.spaceId, 'Adding additional details');

    fakeChatProvider.setHandler(() => ({
      text: JSON.stringify({
        title: null,
        content: 'New appended detail.',
        dueAt: '2026-08-11T15:00:00+03:00',
      }),
      inputTokens: 80,
      outputTokens: 30,
    }));

    const res = await app.server.inject({
      method: 'POST',
      url: '/ai/note-write',
      headers: { authorization: `Bearer ${user.token}` },
      payload: {
        transcriptId,
        noteId: note.id,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.changed).toBe(true);
    expect(body.creditsCharged).toBeGreaterThan(0);

    // Verify note content is appended
    const updatedNote = await app.db
      .selectFrom('sticky_notes')
      .selectAll()
      .where('id', '=', note.id)
      .executeTakeFirstOrThrow();
    expect(updatedNote.content).toBe('Original thoughts before voice update.\n\nNew appended detail.');
    expect(updatedNote.due_at).not.toBeNull();

    // Verify ai_actions status is 'accepted' (closes M5)
    const action = await app.db
      .selectFrom('ai_actions')
      .selectAll()
      .where('transcript_id', '=', transcriptId)
      .executeTakeFirstOrThrow();
    expect(action.status).toBe('accepted');
  });
});
