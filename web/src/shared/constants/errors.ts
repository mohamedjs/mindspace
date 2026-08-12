export const ErrorCodes = {
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  NEEDS_OWN_KEY: 'NEEDS_OWN_KEY',
  AI_SCHEMA_FAILED: 'AI_SCHEMA_FAILED',
  TRANSCRIBE_FAILED: 'TRANSCRIBE_FAILED',
  PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export const errorMessages: Record<ErrorCode, string> = {
  INSUFFICIENT_CREDITS: 'Not enough credits. Add more to continue.',
  NEEDS_OWN_KEY: 'This model requires your own API key.',
  AI_SCHEMA_FAILED: 'AI returned an unexpected format. Try again.',
  TRANSCRIBE_FAILED: 'Transcription failed. Your recording is safe.',
  PROVIDER_AUTH_FAILED: 'API key is no longer valid.',
};
