import type { TranscribeRequest, TranscribeResult } from './domain/entities.js';
import type { Transcriber } from './domain/ports.js';
import { TranscribeAudioUseCase } from './application/index.js';
import { OpenRouterTranscriber } from './infrastructure/index.js';

export * from './domain/index.js';
export * from './application/index.js';
export * from './infrastructure/index.js';

export interface TranscriptionModuleDependencies {
  transcriber?: Transcriber;
}

export interface TranscriptionModule {
  transcribe(request: TranscribeRequest): Promise<TranscribeResult>;
  setTranscriber(transcriber: Transcriber): void;
}

export function createTranscriptionModule(
  deps?: TranscriptionModuleDependencies
): TranscriptionModule {
  let activeTranscriber: Transcriber = deps?.transcriber ?? new OpenRouterTranscriber();

  const proxyTranscriber: Transcriber = {
    transcribe: (req) => activeTranscriber.transcribe(req),
  };

  const transcribeUseCase = new TranscribeAudioUseCase(proxyTranscriber);

  return {
    transcribe: (req) => transcribeUseCase.execute(req),
    setTranscriber: (transcriber) => {
      activeTranscriber = transcriber;
    },
  };
}
