import { PartsStore, type RecordingPart } from './parts-store.js';

export interface UploaderOptions {
  apiUrl: string;
  partsStore: PartsStore;
  getAccessToken: () => Promise<string | null>;
  refreshAccessToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  initialRetryDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
  onPartUploaded?: (recordingId: string, partIndex: number) => void;
  onFinished?: (recordingId: string) => void;
  onError?: (error: Error, part?: RecordingPart) => void;
}

export class Uploader {
  private readonly apiUrl: string;
  private readonly partsStore: PartsStore;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly refreshAccessToken: () => Promise<string | null>;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly initialRetryDelayMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly onPartUploaded?: (recordingId: string, partIndex: number) => void;
  private readonly onFinished?: (recordingId: string) => void;
  private readonly onError?: (error: Error, part?: RecordingPart) => void;

  private isProcessing = false;

  constructor(options: UploaderOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, '');
    this.partsStore = options.partsStore;
    this.getAccessToken = options.getAccessToken;
    this.refreshAccessToken = options.refreshAccessToken;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = options.maxRetries ?? 5;
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 1000;
    this.sleepFn =
      options.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onPartUploaded = options.onPartUploaded;
    this.onFinished = options.onFinished;
    this.onError = options.onError;
  }

  public async uploadPartWithRetry(part: RecordingPart): Promise<boolean> {
    await this.partsStore.updatePartStatus(part.id, 'uploading');

    let attempt = 0;
    let refreshedToken = false;

    while (attempt <= this.maxRetries) {
      let token = await this.getAccessToken();

      try {
        const uploadUrl = `${this.apiUrl}/recordings/${part.recordingId}/parts/${part.partIndex}`;

        const headers: Record<string, string> = {
          'Content-Type': 'audio/webm;codecs=opus',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await this.fetchFn(uploadUrl, {
          method: 'PUT',
          headers,
          body: part.blob as any,
        });

        // 2xx Success: Delete from IndexedDB ONLY after 2xx
        if (res.ok) {
          await this.partsStore.deletePart(part.id);
          this.onPartUploaded?.(part.recordingId, part.partIndex);
          return true;
        }

        // 401 Unauthorized: Attempt token refresh once
        if (res.status === 401 && !refreshedToken) {
          refreshedToken = true;
          token = await this.refreshAccessToken();
          if (token) {
            continue; // Retry immediately with refreshed token
          }
          const authErr = new Error(`Authentication failed during upload of part ${part.partIndex}`);
          await this.partsStore.incrementAttempts(part.id, authErr.message);
          this.onError?.(authErr, part);
          return false;
        }

        // 429 Rate Limit or 5xx Server Error: Retry with backoff
        if (res.status === 429 || res.status >= 500) {
          const errText = `Server error ${res.status} uploading part ${part.partIndex}`;
          await this.partsStore.incrementAttempts(part.id, errText);
          attempt++;
          if (attempt <= this.maxRetries) {
            const delay = this.initialRetryDelayMs * Math.pow(2, attempt - 1);
            await this.sleepFn(delay);
            continue;
          }
          this.onError?.(new Error(errText), part);
          return false;
        }

        // Other 4xx client errors: Unrecoverable
        const clientErr = new Error(
          `Client error ${res.status} uploading part ${part.partIndex}: ${await res.text()}`
        );
        await this.partsStore.updatePartStatus(part.id, 'failed', clientErr.message);
        this.onError?.(clientErr, part);
        return false;
      } catch (err: any) {
        // Network or fetch exceptions: Retry with backoff
        const netErr = `Network error uploading part ${part.partIndex}: ${err?.message || String(err)}`;
        await this.partsStore.incrementAttempts(part.id, netErr);
        attempt++;
        if (attempt <= this.maxRetries) {
          const delay = this.initialRetryDelayMs * Math.pow(2, attempt - 1);
          await this.sleepFn(delay);
          continue;
        }
        this.onError?.(new Error(netErr), part);
        return false;
      }
    }

    return false;
  }

  public async uploadPendingParts(recordingId?: string): Promise<boolean> {
    if (this.isProcessing) {
      return false;
    }
    this.isProcessing = true;

    try {
      const pendingParts = await this.partsStore.getPendingParts(recordingId);
      // Strictly enforce order: part 0, then part 1, then part 2...
      pendingParts.sort((a, b) => {
        if (a.recordingId !== b.recordingId) {
          return a.recordingId.localeCompare(b.recordingId);
        }
        return a.partIndex - b.partIndex;
      });

      for (const part of pendingParts) {
        const success = await this.uploadPartWithRetry(part);
        if (!success) {
          // Preserve order: never skip a failed part to upload a subsequent part
          return false;
        }
      }
      return true;
    } finally {
      this.isProcessing = false;
    }
  }

  public async finishRecording(recordingId: string): Promise<boolean> {
    // 1. Upload any pending parts for this recording first
    let pending = await this.partsStore.getPendingParts(recordingId);
    if (pending.length > 0) {
      const ok = await this.uploadPendingParts(recordingId);
      if (!ok) {
        throw new Error(`Cannot finish recording ${recordingId}; some parts failed to upload.`);
      }
      pending = await this.partsStore.getPendingParts(recordingId);
      if (pending.length > 0) {
        throw new Error(`Cannot finish recording ${recordingId}; ${pending.length} parts remain pending.`);
      }
    }

    // 2. Call finish endpoint
    let token = await this.getAccessToken();
    const finishUrl = `${this.apiUrl}/recordings/${recordingId}/finish`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await this.fetchFn(finishUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });

        if (res.ok) {
          this.onFinished?.(recordingId);
          return true;
        }

        if (res.status === 401 && attempt === 0) {
          token = await this.refreshAccessToken();
          if (token) continue;
        }

        if (res.status === 429 || res.status >= 500) {
          if (attempt < this.maxRetries) {
            const delay = this.initialRetryDelayMs * Math.pow(2, attempt);
            await this.sleepFn(delay);
            continue;
          }
        }

        const errText = await res.text();
        throw new Error(`Failed to finish recording ${recordingId}: HTTP ${res.status} ${errText}`);
      } catch (err: any) {
        if (attempt < this.maxRetries) {
          const delay = this.initialRetryDelayMs * Math.pow(2, attempt);
          await this.sleepFn(delay);
          continue;
        }
        this.onError?.(err);
        throw err;
      }
    }

    return false;
  }

  public async resumePendingRecordings(options?: {
    isRecordingActive?: (recordingId: string) => boolean;
  }): Promise<{ finished: string[]; pending: string[] }> {
    const allPending = await this.partsStore.getPendingParts();
    const recordingIds = [...new Set(allPending.map((p) => p.recordingId))];
    const finished: string[] = [];
    const pending: string[] = [];

    for (const recordingId of recordingIds) {
      const success = await this.uploadPendingParts(recordingId);
      const remaining = await this.partsStore.getPendingParts(recordingId);

      const isActive = options?.isRecordingActive?.(recordingId) ?? false;

      // If no longer actively recording and all parts uploaded, finish it
      if (!isActive && remaining.length === 0) {
        try {
          await this.finishRecording(recordingId);
          finished.push(recordingId);
        } catch {
          pending.push(recordingId);
        }
      } else {
        pending.push(recordingId);
      }
    }

    return { finished, pending };
  }
}
