import { buildStoragePath, extensionFor, mimeToExt } from './audioFormat';

describe('recording upload naming', () => {
  it('maps MediaRecorder mime types (with codec params) to a container extension', () => {
    expect(mimeToExt('audio/webm;codecs=opus')).toBe('webm');
    expect(mimeToExt('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    expect(mimeToExt('audio/ogg')).toBe('ogg');
    expect(mimeToExt('AUDIO/WAV')).toBe('wav');
    // Unknown/absent falls back to the MediaRecorder default rather than throwing.
    expect(mimeToExt(undefined)).toBe('webm');
    expect(mimeToExt('audio/weird')).toBe('webm');
  });

  it('always reports m4a on native, and the real container on web', () => {
    expect(extensionFor('ios')).toEqual({ ext: 'm4a', contentType: 'audio/m4a' });
    expect(extensionFor('android')).toEqual({ ext: 'm4a', contentType: 'audio/m4a' });
    expect(extensionFor('web', 'audio/webm;codecs=opus')).toEqual({
      ext: 'webm',
      contentType: 'audio/webm',
    });
    expect(extensionFor('web', 'audio/mp4')).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
  });

  it('builds a path whose extension the transcribe function can parse back out', () => {
    const path = buildStoragePath('user-1', 'space-1', 'rec-1', 'webm');
    expect(path).toBe('user-1/space-1/rec-1.webm');
    // This is exactly how the transcribe function derives `format`.
    expect(path.split('.').pop()).toBe('webm');
  });
});
