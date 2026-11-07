export class RecordingNotFoundError extends Error {
  constructor(message = 'Recording not found') {
    super(message);
    this.name = 'RecordingNotFoundError';
  }
}

export class SpaceNotFoundForRecordingError extends Error {
  constructor(message = 'Space not found') {
    super(message);
    this.name = 'SpaceNotFoundForRecordingError';
  }
}

export class NoteNotFoundForRecordingError extends Error {
  constructor(message = 'Note not found') {
    super(message);
    this.name = 'NoteNotFoundForRecordingError';
  }
}

export class InvalidAudioContainerError extends Error {
  constructor(message = 'Unsupported or invalid audio format') {
    super(message);
    this.name = 'InvalidAudioContainerError';
  }
}

export class AudioPartTooLargeError extends Error {
  constructor(message = 'Audio part exceeds maximum allowed size') {
    super(message);
    this.name = 'AudioPartTooLargeError';
  }
}

export class RecordingNotUploadedError extends Error {
  constructor(message = 'Recording has no uploaded audio parts') {
    super(message);
    this.name = 'RecordingNotUploadedError';
  }
}

export class RecordingCapExceededError extends Error {
  public readonly code = 'recording_too_long';
  constructor(maxMinutes: number) {
    super(`Recording exceeds plan maximum of ${maxMinutes} minutes`);
    this.name = 'RecordingCapExceededError';
  }
}

export class AiNotInPlanError extends Error {
  public readonly code = 'ai_not_in_plan';
  constructor(message = 'AI transcription is not enabled on the current plan') {
    super(message);
    this.name = 'AiNotInPlanError';
  }
}

export class NoModelAvailableError extends Error {
  public readonly code = 'no_model_available';
  constructor(message = 'No default transcription model configured') {
    super(message);
    this.name = 'NoModelAvailableError';
  }
}
