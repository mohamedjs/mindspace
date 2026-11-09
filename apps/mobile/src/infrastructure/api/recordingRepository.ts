import type { Recording } from '../../core/domain';
import type { RecordingRepository, RecordingStatusValue } from '../../core/ports';
import { PipelineError } from '../../core/errors';
import { apiFetch } from './client';
import { toRecording } from './mappers';

export const apiRecordingRepository: RecordingRepository = {
  async listBySpace(spaceId: string): Promise<Recording[]> {
    const data = await apiFetch<Record<string, unknown>[]>(`/spaces/${spaceId}/recordings`);
    return (data ?? []).map(toRecording);
  },

  async create(input: {
    spaceId: string;
    durationMs: number;
    parentNoteId?: string;
    fillNoteId?: string;
  }): Promise<string> {
    const data = await apiFetch<{ id: string }>(`/spaces/${input.spaceId}/recordings`, {
      method: 'POST',
      body: JSON.stringify({
        duration_ms: input.durationMs,
        ...(input.parentNoteId ? { parent_note_id: input.parentNoteId } : {}),
        ...(input.fillNoteId
          ? { target_note_id: input.fillNoteId, process_mode: 'note_write' }
          : {}),
      }),
    });
    return data.id;
  },

  async markFailed(recordingId: string, errorText: string): Promise<void> {
    await apiFetch(`/recordings/${recordingId}/failed`, {
      method: 'POST',
      body: JSON.stringify({ error: errorText }),
    });
  },

  async markCompleted(recordingId: string): Promise<void> {
    await apiFetch(`/recordings/${recordingId}/completed`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async findTranscriptId(recordingId: string): Promise<string | null> {
    try {
      const data = await apiFetch<{ transcript_id: string | null }>(
        `/recordings/${recordingId}/transcript-id`
      );
      return data?.transcript_id ?? null;
    } catch (err) {
      if (err instanceof PipelineError && err.status === 404) {
        return null;
      }
      return null;
    }
  },

  async getStatus(
    recordingId: string
  ): Promise<{ status: RecordingStatusValue; error: string | null } | null> {
    try {
      const data = await apiFetch<{ status: RecordingStatusValue; error: string | null }>(
        `/recordings/${recordingId}/status`
      );
      return data ? { status: data.status, error: data.error ?? null } : null;
    } catch (err) {
      if (err instanceof PipelineError && err.status === 404) {
        return null;
      }
      return null;
    }
  },

  async finish(recordingId: string): Promise<void> {
    await apiFetch<{ id: string; status: string }>(`/recordings/${recordingId}/finish`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
