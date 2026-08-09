import type { Platform } from 'react-native';

/**
 * MIME type -> file extension for the containers a recorder can hand us.
 * The extension is not cosmetic: the transcribe edge function parses it back
 * off storage_path to tell the model which container to decode.
 */
const MIME_EXT: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
};

/**
 * Browsers report e.g. "audio/webm;codecs=opus" — strip parameters before
 * looking up. Unknown types fall back to webm, the MediaRecorder default.
 */
export function mimeToExt(mimeType: string | undefined): string {
  if (!mimeType) return 'webm';
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return MIME_EXT[base] ?? 'webm';
}

/**
 * Native expo-audio always writes m4a/AAC per MINDSPACE_RECORDING_OPTIONS.
 * Web is decided at runtime by whatever MediaRecorder actually produced, so
 * web callers pass the real blob type instead of relying on this default.
 */
export function extensionFor(platform: typeof Platform.OS, webMimeType?: string) {
  if (platform !== 'web') return { ext: 'm4a', contentType: 'audio/m4a' };
  const ext = mimeToExt(webMimeType);
  return { ext, contentType: webMimeType?.split(';')[0] ?? 'audio/webm' };
}

export function buildStoragePath(
  userId: string,
  spaceId: string,
  recordingId: string,
  ext: string
) {
  return `${userId}/${spaceId}/${recordingId}.${ext}`;
}
