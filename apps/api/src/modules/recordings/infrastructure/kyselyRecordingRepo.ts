import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type {
  CreateRecordingInput,
  ExtractionHandoffInput,
  Recording,
  RecordingKind,
  RecordingListItem,
  RecordingPart,
  RecordingStatus,
  ResolvedTranscribeModel,
  Transcript,
  UserEntitlements,
} from '../domain/entities.js';
import {
  NoModelAvailableError,
  NoteNotFoundForRecordingError,
} from '../domain/errors.js';
import type {
  CreditsReservationPort,
  EntitlementsPort,
  ExtractorPort,
  NoteOwnershipPort,
  RecordingEventsPort,
  RecordingRepositoryPort,
  TranscribeModelResolverPort,
} from '../domain/ports.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val: string | null | undefined): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

function toIsoString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function mapRecordingRow(row: any): Recording {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    spaceId: String(row.space_id),
    storagePath: row.storage_path ?? null,
    localOnly: Boolean(row.local_only),
    durationMs: Number(row.duration_ms ?? 0),
    sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : null,
    mimeType: String(row.mime_type ?? 'audio/m4a'),
    status: row.status as RecordingStatus,
    error: row.error ?? null,
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
    attempts: Number(row.attempts ?? 0),
    processMode: row.process_mode ?? null,
    targetNoteId: row.target_note_id ?? null,
    parentNoteId: row.parent_note_id ?? null,
    kind: (row.kind ?? 'note') as RecordingKind,
    createdAt: toIsoString(row.created_at),
  };
}

function mapPartRow(row: any): RecordingPart {
  return {
    id: String(row.id),
    recordingId: String(row.recording_id),
    userId: String(row.user_id),
    idx: Number(row.idx),
    blobKey: String(row.blob_key),
    durationMs:
      row.duration_ms !== null && row.duration_ms !== undefined ? Number(row.duration_ms) : null,
    status: String(row.status),
    transcriptText: row.transcript_text ?? null,
    attempts: Number(row.attempts ?? 0),
    error: row.error ?? null,
    createdAt: toIsoString(row.created_at),
  };
}

function mapTranscriptRow(row: any): Transcript {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    recordingId: String(row.recording_id),
    text: String(row.text),
    language: row.language ?? null,
    provider: String(row.provider),
    modelId: String(row.model_id),
    createdAt: toIsoString(row.created_at),
  };
}

export class KyselyRecordingRepository implements RecordingRepositoryPort {
  constructor(private readonly db: Database) {}

  async create(input: CreateRecordingInput): Promise<Recording> {
    const row = await this.db
      .insertInto('recordings')
      .values({
        user_id: input.userId,
        space_id: input.spaceId,
        duration_ms: 0,
        status: 'recorded',
        local_only: true,
        kind: input.kind,
        process_mode: input.processMode,
        target_note_id: input.targetNoteId,
        parent_note_id: input.parentNoteId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapRecordingRow(row);
  }

  async findByIdForUser(recordingId: string, userId: string): Promise<Recording | null> {
    if (!isUuid(recordingId) || !isUuid(userId)) {
      return null;
    }

    const row = await this.db
      .selectFrom('recordings')
      .selectAll()
      .where('id', '=', recordingId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return row ? mapRecordingRow(row) : null;
  }

  async listBySpaceForUser(spaceId: string, userId: string): Promise<RecordingListItem[]> {
    if (!isUuid(spaceId) || !isUuid(userId)) {
      return [];
    }

    const recordings = await this.db
      .selectFrom('recordings')
      .select(['id', 'status', 'error', 'duration_ms', 'created_at', 'storage_path'])
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute();

    if (recordings.length === 0) {
      return [];
    }

    const recordingIds = recordings.map((r: any) => String(r.id));

    const [transcriptRows, noteRows] = await Promise.all([
      this.db
        .selectFrom('transcripts')
        .select(['recording_id', 'text'])
        .where('user_id', '=', userId)
        .where('recording_id', 'in', recordingIds)
        .orderBy('created_at', 'desc')
        .execute(),
      this.db
        .selectFrom('sticky_notes')
        .select(['id', 'recording_id', 'title', 'content', 'type', 'color', 'deleted_at'])
        .where('user_id', '=', userId)
        .where('recording_id', 'in', recordingIds)
        .orderBy('created_at', 'asc')
        .execute(),
    ]);

    const transcriptsByRec = new Map<string, Array<{ text: string }>>();
    for (const tr of transcriptRows) {
      const rid = String(tr.recording_id);
      const list = transcriptsByRec.get(rid) ?? [];
      list.push({ text: String(tr.text) });
      transcriptsByRec.set(rid, list);
    }

    const notesByRec = new Map<string, RecordingListItem['sticky_notes']>();
    for (const note of noteRows) {
      const rid = String(note.recording_id);
      const list = notesByRec.get(rid) ?? [];
      list.push({
        id: String(note.id),
        title: note.title ?? null,
        content: String(note.content),
        type: String(note.type),
        color: note.color ?? null,
        deleted_at: note.deleted_at ? toIsoString(note.deleted_at) : null,
      });
      notesByRec.set(rid, list);
    }

    return recordings.map((r: any) => {
      const id = String(r.id);
      return {
        id,
        status: r.status as RecordingStatus,
        error: r.error ?? null,
        duration_ms: Number(r.duration_ms ?? 0),
        created_at: toIsoString(r.created_at),
        storage_path: r.storage_path ?? null,
        transcripts: transcriptsByRec.get(id) ?? [],
        sticky_notes: notesByRec.get(id) ?? [],
      };
    });
  }

  async upsertPart(input: {
    recordingId: string;
    userId: string;
    idx: number;
    blobKey: string;
    sizeBytes: number;
    mimeType: string;
  }): Promise<RecordingPart> {
    return this.db.transaction().execute(async (trx) => {
      const partRes = await sql<any>`
        INSERT INTO recording_parts (recording_id, user_id, idx, blob_key, status, error)
        VALUES (${input.recordingId}, ${input.userId}, ${input.idx}, ${input.blobKey}, 'uploaded', NULL)
        ON CONFLICT (recording_id, idx)
        DO UPDATE SET
          blob_key = EXCLUDED.blob_key,
          duration_ms = NULL,
          status = 'uploaded',
          transcript_text = NULL,
          error = NULL
        WHERE recording_parts.user_id = ${input.userId}
        RETURNING *
      `.execute(trx);

      const partRow = partRes.rows[0];

      await trx
        .updateTable('recordings')
        .set({
          local_only: false,
          storage_path: input.idx === 0 ? input.blobKey : sql`COALESCE(storage_path, ${input.blobKey})`,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
        })
        .where('id', '=', input.recordingId)
        .where('user_id', '=', input.userId)
        .execute();

      return mapPartRow(partRow);
    });
  }

  async listParts(recordingId: string, userId: string): Promise<RecordingPart[]> {
    const rows = await this.db
      .selectFrom('recording_parts')
      .selectAll()
      .where('recording_id', '=', recordingId)
      .where('user_id', '=', userId)
      .orderBy('idx', 'asc')
      .execute();

    return rows.map(mapPartRow);
  }

  async updatePartDuration(partId: string, userId: string, durationMs: number): Promise<void> {
    await this.db
      .updateTable('recording_parts')
      .set({ duration_ms: durationMs })
      .where('id', '=', partId)
      .where('user_id', '=', userId)
      .execute();
  }

  async markPartTranscribed(
    partId: string,
    userId: string,
    transcriptText: string
  ): Promise<void> {
    await this.db
      .updateTable('recording_parts')
      .set({
        status: 'transcribed',
        transcript_text: transcriptText,
        attempts: sql`attempts + 1`,
        error: null,
      })
      .where('id', '=', partId)
      .where('user_id', '=', userId)
      .execute();
  }

  async replacePartsAfterSplit(
    recordingId: string,
    userId: string,
    newParts: Array<{
      idx: number;
      blobKey: string;
      durationMs: number;
      status: string;
      transcriptText: string | null;
      attempts: number;
    }>
  ): Promise<RecordingPart[]> {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('recording_parts')
        .where('recording_id', '=', recordingId)
        .where('user_id', '=', userId)
        .execute();

      const inserted: RecordingPart[] = [];
      for (const p of newParts) {
        const row = await trx
          .insertInto('recording_parts')
          .values({
            recording_id: recordingId,
            user_id: userId,
            idx: p.idx,
            blob_key: p.blobKey,
            duration_ms: p.durationMs,
            status: p.status,
            transcript_text: p.transcriptText,
            attempts: p.attempts,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        inserted.push(mapPartRow(row));
      }

      if (newParts.length > 0) {
        await trx
          .updateTable('recordings')
          .set({ storage_path: newParts[0].blobKey })
          .where('id', '=', recordingId)
          .where('user_id', '=', userId)
          .execute();
      }

      return inserted;
    });
  }

  async updateRecordingDuration(
    recordingId: string,
    userId: string,
    durationMs: number
  ): Promise<void> {
    await this.db
      .updateTable('recordings')
      .set({ duration_ms: durationMs })
      .where('id', '=', recordingId)
      .where('user_id', '=', userId)
      .execute();
  }

  async updateStatus(
    recordingId: string,
    userId: string,
    status: RecordingStatus,
    error: string | null = null,
    clearClaim = false
  ): Promise<boolean> {
    if (!isUuid(recordingId) || !isUuid(userId)) {
      return false;
    }

    const patch: Record<string, unknown> = {
      status,
      error,
    };
    if (clearClaim) {
      patch.claimed_at = null;
    }

    const res = await this.db
      .updateTable('recordings')
      .set(patch)
      .where('id', '=', recordingId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return Number(res.numUpdatedRows ?? 0) > 0;
  }

  async queueRecording(
    recordingId: string,
    userId: string
  ): Promise<{ status: RecordingStatus; changed: boolean }> {
    const existing = await this.findByIdForUser(recordingId, userId);
    if (!existing) {
      return { status: 'recorded', changed: false };
    }

    if (
      existing.status === 'recorded' ||
      existing.status === 'uploading' ||
      existing.status === 'failed'
    ) {
      await this.db
        .updateTable('recordings')
        .set({
          status: 'queued',
          error: null,
          claimed_at: null,
          ...(existing.status === 'failed' ? { attempts: 0 } : {}),
        })
        .where('id', '=', recordingId)
        .where('user_id', '=', userId)
        .execute();

      return { status: 'queued', changed: true };
    }

    return { status: existing.status, changed: false };
  }

  async findTranscriptByRecording(
    recordingId: string,
    userId: string
  ): Promise<Transcript | null> {
    if (!isUuid(recordingId) || !isUuid(userId)) {
      return null;
    }

    const row = await this.db
      .selectFrom('transcripts')
      .selectAll()
      .where('recording_id', '=', recordingId)
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    return row ? mapTranscriptRow(row) : null;
  }

  /**
   * Claiming must be atomic, in one UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING.
   */
  async claimNextQueued(): Promise<Recording | null> {
    const res = await sql<any>`
      UPDATE recordings
         SET status = 'transcribing',
             claimed_at = now(),
             attempts = attempts + 1,
             error = NULL
       WHERE id = (
         SELECT id
           FROM recordings
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
      RETURNING *
    `.execute(this.db);

    if (res.rows.length === 0) {
      return null;
    }

    return mapRecordingRow(res.rows[0]);
  }

  async tagReservationForRecording(
    reservationId: string,
    userId: string,
    recordingId: string
  ): Promise<void> {
    await this.db
      .updateTable('credit_reservations')
      .set({ ai_action_id: recordingId })
      .where('id', '=', reservationId)
      .where('user_id', '=', userId)
      .where('status', '=', 'held')
      .execute();
  }

  async findHeldReservationsForRecording(
    recordingId: string,
    userId: string
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom('credit_reservations')
      .select('id')
      .where('user_id', '=', userId)
      .where('status', '=', 'held')
      .where('ai_action_id', '=', recordingId)
      .execute();

    return rows.map((r: any) => String(r.id));
  }

  /**
   * Saves the joined transcript, transitions recording status to 'extracting',
   * and settles the credit reservation in a single database transaction.
   */
  async saveTranscriptAndSettle(input: {
    recordingId: string;
    userId: string;
    text: string;
    language: string | null;
    provider: string;
    modelId: string;
    durationMs: number;
    reservationId: string | null;
    estimatedCredits: number;
    creditsPort: CreditsReservationPort;
  }): Promise<Transcript> {
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('transcripts')
        .selectAll()
        .where('recording_id', '=', input.recordingId)
        .where('user_id', '=', input.userId)
        .executeTakeFirst();

      let transcriptRow = existing;
      if (!transcriptRow) {
        transcriptRow = await trx
          .insertInto('transcripts')
          .values({
            user_id: input.userId,
            recording_id: input.recordingId,
            text: input.text,
            language: input.language,
            provider: input.provider,
            model_id: input.modelId,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      await trx
        .updateTable('recordings')
        .set({
          status: 'extracting',
          error: null,
          duration_ms: input.durationMs,
        })
        .where('id', '=', input.recordingId)
        .where('user_id', '=', input.userId)
        .execute();

      if (input.reservationId) {
        await input.creditsPort.settle(
          input.reservationId,
          input.userId,
          input.estimatedCredits,
          null,
          trx
        );
      }

      return mapTranscriptRow(transcriptRow);
    });
  }

  async isFreePlanUser(userId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('credit_ledger')
      .select(sql<number>`count(*)`.as('cnt'))
      .where('user_id', '=', userId)
      .where('reason', '=', 'purchase')
      .executeTakeFirst();

    return Number(row?.cnt ?? 0) === 0;
  }

  async markAudioRemovedForFreePlan(recordingId: string, userId: string): Promise<void> {
    await this.db
      .updateTable('recordings')
      .set({
        local_only: true,
        storage_path: null,
      })
      .where('id', '=', recordingId)
      .where('user_id', '=', userId)
      .execute();
  }

  async findStaleClaimedRecordings(idleMs: number): Promise<Recording[]> {
    const res = await sql<any>`
      SELECT *
        FROM recordings
       WHERE status IN ('splitting', 'transcribing', 'transcribed', 'extracting')
         AND claimed_at IS NOT NULL
         AND claimed_at <= now() - (${idleMs} * interval '1 millisecond')
       ORDER BY claimed_at ASC
       FOR UPDATE SKIP LOCKED
    `.execute(this.db);

    return res.rows.map(mapRecordingRow);
  }

  async requeueStaleRecording(recordingId: string, userId: string): Promise<void> {
    await this.db
      .updateTable('recordings')
      .set({
        status: 'queued',
        claimed_at: null,
      })
      .where('id', '=', recordingId)
      .where('user_id', '=', userId)
      .execute();
  }

  async failStaleRecording(
    recordingId: string,
    userId: string,
    error: string
  ): Promise<void> {
    await this.db
      .updateTable('recordings')
      .set({
        status: 'failed',
        error,
        claimed_at: null,
      })
      .where('id', '=', recordingId)
      .where('user_id', '=', userId)
      .execute();
  }

  async findUnfinishedRecordingsOlderThan(
    maxAgeMs: number,
    tx?: unknown
  ): Promise<Array<{ id: string; userId: string }>> {
    const exec = (tx as Database | undefined) ?? this.db;
    const res = await sql<{ id: string; user_id: string }>`
      SELECT DISTINCT r.id, r.user_id
        FROM public.recordings r
        LEFT JOIN public.recording_parts rp
          ON rp.recording_id = r.id AND rp.user_id = r.user_id
       WHERE r.status IN ('recorded', 'uploading')
         AND r.created_at <= now() - (${maxAgeMs} * interval '1 millisecond')
         AND (rp.id IS NOT NULL OR r.storage_path IS NOT NULL OR r.local_only = false)
    `.execute(exec);

    return res.rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
    }));
  }

  async deleteRecordingParts(
    recordingId: string,
    userId: string,
    tx?: unknown
  ): Promise<number> {
    const exec = (tx as Database | undefined) ?? this.db;
    const delRes = await exec
      .deleteFrom('recording_parts')
      .where('recording_id', '=', recordingId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    await exec
      .updateTable('recordings')
      .set({
        local_only: true,
        storage_path: null,
        size_bytes: null,
      })
      .where('id', '=', recordingId)
      .where('user_id', '=', userId)
      .execute();

    return Number(delRes.numDeletedRows ?? 0);
  }
}

export class KyselyNoteOwnershipChecker implements NoteOwnershipPort {
  constructor(private readonly db: Database) {}

  async ensureNoteInSpaceOwned(
    noteId: string,
    spaceId: string,
    userId: string
  ): Promise<void> {
    if (!isUuid(noteId) || !isUuid(spaceId) || !isUuid(userId)) {
      throw new NoteNotFoundForRecordingError();
    }

    const row = await this.db
      .selectFrom('sticky_notes')
      .select('id')
      .where('id', '=', noteId)
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!row) {
      throw new NoteNotFoundForRecordingError();
    }
  }
}

export class KyselyTranscribeModelResolver implements TranscribeModelResolverPort {
  constructor(private readonly db: Database) {}

  async resolveTranscribeModel(userId: string): Promise<ResolvedTranscribeModel> {
    const profile = await this.db
      .selectFrom('profiles')
      .select('transcribe_model_id')
      .where('id', '=', userId)
      .executeTakeFirst();

    const preferredId = profile?.transcribe_model_id;
    if (preferredId && isUuid(String(preferredId))) {
      const preferred = await this.db
        .selectFrom('ai_models')
        .select(['id', 'provider', 'model_id', 'credit_multiplier', 'byok_only'])
        .where('id', '=', String(preferredId))
        .where('kind', '=', 'transcribe')
        .where('enabled', '=', true)
        .executeTakeFirst();

      if (preferred) {
        return {
          id: String(preferred.id),
          provider: String(preferred.provider),
          modelId: String(preferred.model_id),
          creditMultiplier: Number(preferred.credit_multiplier),
          byokOnly: Boolean(preferred.byok_only),
        };
      }
    }

    const fallback = await this.db
      .selectFrom('ai_models')
      .select(['id', 'provider', 'model_id', 'credit_multiplier', 'byok_only'])
      .where('kind', '=', 'transcribe')
      .where('is_default', '=', true)
      .where('enabled', '=', true)
      .orderBy('sort_order', 'asc')
      .executeTakeFirst();

    if (!fallback) {
      throw new NoModelAvailableError();
    }

    return {
      id: String(fallback.id),
      provider: String(fallback.provider),
      modelId: String(fallback.model_id),
      creditMultiplier: Number(fallback.credit_multiplier),
      byokOnly: Boolean(fallback.byok_only),
    };
  }
}

export class DefaultEntitlementsAdapter implements EntitlementsPort {
  async getEntitlements(_userId: string): Promise<UserEntitlements> {
    return {
      aiEnabled: true,
      maxRecordingMinutes: null,
    };
  }
}

export class NoopExtractorAdapter implements ExtractorPort {
  constructor(
    private readonly recordingRepo: RecordingRepositoryPort,
    private readonly eventsPort: RecordingEventsPort
  ) {}

  async extract(input: ExtractionHandoffInput): Promise<void> {
    await this.recordingRepo.updateStatus(
      input.recordingId,
      input.userId,
      'completed',
      null,
      true
    );
    await this.eventsPort.publishStatus(input.recordingId, {
      status: 'completed',
      error: null,
    });
  }
}
