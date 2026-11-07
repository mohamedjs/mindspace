import type { Readable } from 'node:stream';

export interface TranscribeRequest {
  apiKey: string;
  model: string;
  provider?: string;
  baseUrl?: string;
  audioStream: Readable;
  format: string;
  partIdx?: number;
  recordingId?: string;
  blobKey?: string;
  signal?: AbortSignal;
}

export interface TranscribeResult {
  text: string;
  language: string | null;
}
