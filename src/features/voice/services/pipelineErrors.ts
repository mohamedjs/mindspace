import { PipelineError } from '../../../core/errors';

export { PipelineError };
/**
 * Everything that can go wrong between tapping record and seeing notes, said
 * in words a person can act on.
 *
 * The edge functions already return precise codes (insufficient_credits,
 * provider_timeout, byok_required…). What was missing was carrying the code
 * this far: invoke() used to flatten it into a message string, so the UI could
 * only ever show one generic "something went wrong".
 */


export type FailureAction = 'retry' | 'buy_credits' | 'add_key' | 'settings' | 'none';

export interface FailureCopy {
  title: string;
  message: string;
  action: FailureAction;
}

const COPY: Record<string, FailureCopy> = {
  insufficient_credits: {
    title: 'Out of credits',
    message: 'Your recording is safe. Add credits and it will pick up where it stopped.',
    action: 'buy_credits',
  },
  byok_required: {
    title: 'That model needs your own key',
    message: 'The model you picked only runs on your API key. Add one, or choose another model.',
    action: 'add_key',
  },
  no_platform_key: {
    title: 'That model is not available',
    message: 'We have no key for this provider. Pick a different model in Settings.',
    action: 'settings',
  },
  unsupported_provider: {
    title: 'That model is not available',
    message: 'This provider is not set up. Pick a different model in Settings.',
    action: 'settings',
  },
  no_model_available: {
    title: 'No model selected',
    message: 'Choose a model in Settings and try again.',
    action: 'settings',
  },
  provider_timeout: {
    title: 'The AI took too long',
    message: 'Your recording is safe. Try again, or pick a faster model in Settings.',
    action: 'retry',
  },
  provider_error: {
    title: 'The AI service had a problem',
    message: 'Not your fault, and your recording is safe. Try again in a moment.',
    action: 'retry',
  },
  recording_not_uploaded: {
    title: 'The audio never finished uploading',
    message: 'Check your connection and record again.',
    action: 'none',
  },
  transcript_not_found: {
    title: "We lost track of that recording",
    message: 'Try recording again.',
    action: 'none',
  },
  notes_insert_failed: {
    title: 'Could not save your notes',
    message: 'The AI understood you, but saving failed. Try again — you were not charged.',
    action: 'retry',
  },
  note_update_failed: {
    title: 'Could not save into that note',
    message: 'Try again — you were not charged.',
    action: 'retry',
  },
  provider_not_configured: {
    title: 'That payment method is not ready',
    message: 'Pick another way to pay.',
    action: 'none',
  },
};

const FALLBACK: FailureCopy = {
  title: 'Could not turn that into notes',
  message: 'Your audio is safe on this device. Try again.',
  action: 'retry',
};

/** Friendly copy for any failure, including ones we have no specific code for. */
export function describeFailure(err: unknown): FailureCopy {
  if (err instanceof PipelineError) {
    const known = COPY[err.code];
    if (known) return known;
    // Unknown code: still better than "non-2xx status" — show what came back.
    return { ...FALLBACK, message: err.message || FALLBACK.message };
  }

  // A bare Error from the recording status row, which stores the code we
  // persisted in markRecordingFailed.
  if (err instanceof Error) {
    const known = COPY[err.message];
    if (known) return known;
  }

  return FALLBACK;
}

/** Copy for a `recordings.error` value read back off the row. */
export function describeStoredFailure(stored: string | null | undefined): FailureCopy {
  if (!stored) return FALLBACK;
  // markRecordingFailed stores "code: message" so the code survives the trip.
  const code = stored.split(':')[0]?.trim();
  return COPY[code] ?? { ...FALLBACK, message: stored };
}
