import type { TranscribeRequest, TranscribeResult } from './entities.js';

export interface Transcriber {
  transcribe(request: TranscribeRequest): Promise<TranscribeResult>;
}
