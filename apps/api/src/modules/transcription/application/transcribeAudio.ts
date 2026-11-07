import type { TranscribeRequest, TranscribeResult } from '../domain/entities.js';
import type { Transcriber } from '../domain/ports.js';

export class TranscribeAudioUseCase {
  constructor(private readonly transcriber: Transcriber) {}

  async execute(request: TranscribeRequest): Promise<TranscribeResult> {
    return this.transcriber.transcribe(request);
  }
}
