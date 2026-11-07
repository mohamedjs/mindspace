export class AiDomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AiDomainError';
  }
}

export class SpaceNotFoundError extends AiDomainError {
  constructor(message = 'space_not_found') {
    super('space_not_found', 404, message);
    this.name = 'SpaceNotFoundError';
  }
}

export class NoteNotFoundError extends AiDomainError {
  constructor(message = 'note_not_found') {
    super('note_not_found', 404, message);
    this.name = 'NoteNotFoundError';
  }
}

export class TranscriptNotFoundError extends AiDomainError {
  constructor(message = 'transcript_not_found') {
    super('transcript_not_found', 404, message);
    this.name = 'TranscriptNotFoundError';
  }
}

export class ActionNotFoundError extends AiDomainError {
  constructor(message = 'action_not_found') {
    super('action_not_found', 404, message);
    this.name = 'ActionNotFoundError';
  }
}

export class ModelNotFoundError extends AiDomainError {
  constructor(message = 'model_not_found') {
    super('model_not_found', 404, message);
    this.name = 'ModelNotFoundError';
  }
}

export class NoModelAvailableError extends AiDomainError {
  constructor(message = 'no default chat model configured') {
    super('no_model_available', 500, message);
    this.name = 'NoModelAvailableError';
  }
}

export class AiTimeoutError extends AiDomainError {
  constructor(message = 'chat took longer than 120s — try a faster model') {
    super('provider_timeout', 504, message);
    this.name = 'AiTimeoutError';
  }
}

export class AiProviderError extends AiDomainError {
  constructor(status: number, message: string) {
    super('provider_error', status >= 400 && status < 600 ? status : 502, message);
    this.name = 'AiProviderError';
  }
}

export class MissingParametersError extends AiDomainError {
  constructor(message = 'missing_params') {
    super('missing_params', 400, message);
    this.name = 'MissingParametersError';
  }
}

export class ForbiddenError extends AiDomainError {
  constructor(message = 'forbidden') {
    super('forbidden', 403, message);
    this.name = 'ForbiddenError';
  }
}
