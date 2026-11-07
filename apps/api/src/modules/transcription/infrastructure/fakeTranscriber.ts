import { streamToBase64 } from '../../../platform/blob.js';
import type { TranscribeRequest, TranscribeResult } from '../domain/entities.js';
import type { Transcriber } from '../domain/ports.js';

export interface FakeTranscriberCall {
  partIdx?: number;
  recordingId?: string;
  blobKey?: string;
  model: string;
  format: string;
  base64Length: number;
}

export type FakeTranscribeHandler = (
  request: TranscribeRequest & { base64Audio: string }
) => Promise<TranscribeResult> | TranscribeResult;

export class FakeTranscriber implements Transcriber {
  public readonly calls: FakeTranscriberCall[] = [];
  public readonly completionOrder: number[] = [];
  private handler: FakeTranscribeHandler;

  constructor(handler?: FakeTranscribeHandler) {
    this.handler =
      handler ??
      ((req) => ({
        text: `Part ${req.partIdx ?? 0} transcript`,
        language: 'en',
      }));
  }

  setHandler(handler: FakeTranscribeHandler): void {
    this.handler = handler;
  }

  reset(): void {
    this.calls.length = 0;
    this.completionOrder.length = 0;
  }

  async transcribe(request: TranscribeRequest): Promise<TranscribeResult> {
    if (request.signal?.aborted) {
      throw request.signal.reason ?? new Error('Aborted');
    }

    const base64Audio = await streamToBase64(request.audioStream);

    if (request.signal?.aborted) {
      throw request.signal.reason ?? new Error('Aborted');
    }

    this.calls.push({
      partIdx: request.partIdx,
      recordingId: request.recordingId,
      blobKey: request.blobKey,
      model: request.model,
      format: request.format,
      base64Length: base64Audio.length,
    });

    const result = await this.handler({ ...request, base64Audio });

    if (request.signal?.aborted) {
      throw request.signal.reason ?? new Error('Aborted');
    }

    if (request.partIdx !== undefined) {
      this.completionOrder.push(request.partIdx);
    }

    return result;
  }
}
