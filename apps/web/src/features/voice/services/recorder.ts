export const FREE_MAX_RECORDING_MIN = 5;
export const FREE_MAX_RECORDING_SEC = FREE_MAX_RECORDING_MIN * 60;

/** Metering cadence. Feeds an imperative level meter, never React state. */
export const METERING_INTERVAL_MS = 60;

/**
 * Mono, modest bitrate — small enough to upload on Egyptian mobile data.
 */
export const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

/**
 * Container choice priority. audio/mp4 is preferred where supported (Safari, Chrome 122+),
 * followed by audio/webm.
 */
const PREFERRED = [
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

export function pickMimeType(): string | undefined {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return undefined;
  return PREFERRED.find((t) => MediaRecorder.isTypeSupported(t));
}
