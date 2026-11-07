import type { ChatArgs, ChatResult } from '../domain/entities.js';
import { AiProviderError, AiTimeoutError } from '../domain/errors.js';
import type { AiChatProviderPort } from '../domain/ports.js';

export interface FakeChatHandler {
  (args: ChatArgs): Promise<ChatResult> | ChatResult;
}

export class FakeAiChatProvider implements AiChatProviderPort {
  public recordedCalls: ChatArgs[] = [];
  private customHandler: FakeChatHandler | null = null;
  private queuedResults: ChatResult[] = [];
  public shouldTimeout = false;
  public failureStatus: number | null = null;
  public defaultInputTokens = 100;
  public defaultOutputTokens = 50;

  setHandler(handler: FakeChatHandler | null): void {
    this.customHandler = handler;
  }

  queueResult(result: ChatResult): void {
    this.queuedResults.push(result);
  }

  reset(): void {
    this.recordedCalls = [];
    this.customHandler = null;
    this.queuedResults = [];
    this.shouldTimeout = false;
    this.failureStatus = null;
  }

  async chat(args: ChatArgs): Promise<ChatResult> {
    this.recordedCalls.push(args);

    if (this.shouldTimeout) {
      throw new AiTimeoutError();
    }

    if (this.failureStatus) {
      throw new AiProviderError(this.failureStatus, `Fake error ${this.failureStatus}`);
    }

    if (this.queuedResults.length > 0) {
      return this.queuedResults.shift()!;
    }

    if (this.customHandler) {
      return this.customHandler(args);
    }

    // Default response: detect if writeNote or extractThoughts
    if (args.system.includes('writing one sticky note')) {
      return {
        text: JSON.stringify({
          title: 'Written note title',
          content: 'Written note content from speech.',
          dueAt: null,
        }),
        inputTokens: this.defaultInputTokens,
        outputTokens: this.defaultOutputTokens,
      };
    }

    return {
      text: JSON.stringify({
        notes: [
          {
            clientKey: 'note_0',
            title: 'Extracted thought',
            content: 'This is an extracted thought from the transcript.',
            type: 'idea',
            parentClientKey: null,
            dueAt: null,
          },
        ],
        relations: [],
      }),
      inputTokens: this.defaultInputTokens,
      outputTokens: this.defaultOutputTokens,
    };
  }
}
