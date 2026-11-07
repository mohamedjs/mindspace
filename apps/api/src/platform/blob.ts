import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

export const ALLOWED_AUDIO_EXTENSIONS = ['webm', 'm4a', 'mp4', 'mp3', 'wav', 'ogg'] as const;
export type AllowedAudioExtension = (typeof ALLOWED_AUDIO_EXTENSIONS)[number];

export const DEFAULT_MAX_PART_BYTES = 25 * 1024 * 1024; // 25 MiB

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidAudioFormatError extends Error {
  constructor(message = 'Unsupported or invalid audio container magic bytes') {
    super(message);
    this.name = 'InvalidAudioFormatError';
  }
}

export class BlobTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Audio part exceeds maximum size of ${maxBytes} bytes`);
    this.name = 'BlobTooLargeError';
  }
}

export class BlobQuotaExceededError extends Error {
  constructor(maxQuotaBytes: number) {
    super(`User stored audio quota of ${maxQuotaBytes} bytes exceeded`);
    this.name = 'BlobQuotaExceededError';
  }
}

/**
 * Inspects magic bytes (not client headers or filenames) to identify the container.
 * Allowed containers: .webm .m4a .mp4 .mp3 .wav .ogg
 */
export function detectAudioExtension(header: Buffer): AllowedAudioExtension | null {
  if (!header || header.length < 4) {
    return null;
  }

  // 1. WebM / EBML: starts with 0x1A 0x45 0xDF 0xA3
  if (
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3
  ) {
    return 'webm';
  }

  // 2. Ogg: starts with "OggS" (0x4F 0x67 0x67 0x53)
  if (
    header[0] === 0x4f &&
    header[1] === 0x67 &&
    header[2] === 0x67 &&
    header[3] === 0x53
  ) {
    return 'ogg';
  }

  // 3. WAV: starts with "RIFF" at 0..4 and "WAVE" at 8..12
  if (
    header.length >= 12 &&
    header[0] === 0x52 && // R
    header[1] === 0x49 && // I
    header[2] === 0x46 && // F
    header[3] === 0x46 && // F
    header[8] === 0x57 && // W
    header[9] === 0x41 && // A
    header[10] === 0x56 && // V
    header[11] === 0x45 // E
  ) {
    return 'wav';
  }

  // 4. MP4 / M4A (ISOBMFF): bytes 4..8 are "ftyp" (0x66 0x74 0x79 0x70)
  if (
    header.length >= 12 &&
    header[4] === 0x66 && // f
    header[5] === 0x74 && // t
    header[6] === 0x79 && // y
    header[7] === 0x70 // p
  ) {
    const brand = header.subarray(8, 12).toString('ascii').toUpperCase();
    if (brand.startsWith('M4A') || brand.startsWith('M4B') || brand.startsWith('M4P')) {
      return 'm4a';
    }
    return 'mp4';
  }

  // 5. MP3:
  // (a) ID3v2 tag header: "ID3" (0x49 0x44 0x33)
  if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
    return 'mp3';
  }
  // (b) MPEG audio frame sync: 0xFF followed by sync + valid version + valid layer
  if (
    header[0] === 0xff &&
    (header[1] & 0xe0) === 0xe0 &&
    (header[1] & 0x18) !== 0x08 && // version 01 is reserved
    (header[1] & 0x06) !== 0x00 // layer 00 is reserved
  ) {
    return 'mp3';
  }

  return null;
}

export function mimeTypeForExt(ext: AllowedAudioExtension): string {
  switch (ext) {
    case 'webm':
      return 'audio/webm';
    case 'm4a':
      return 'audio/m4a';
    case 'mp4':
      return 'audio/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
  }
}

export interface SavePartInput {
  userId: string;
  recordingId: string;
  idx: number;
  stream: Readable;
  maxBytes?: number;
  quotaMaxBytes?: number;
}

export interface SavePartResult {
  blobKey: string;
  ext: AllowedAudioExtension;
  sizeBytes: number;
}

export interface BlobStore {
  buildPartKey(userId: string, recordingId: string, idx: number, ext: AllowedAudioExtension): string;
  resolveFilePath(key: string): string;
  savePartFromStream(input: SavePartInput): Promise<SavePartResult>;
  createReadStream(key: string): Readable;
  delete(key: string): Promise<void>;
  deleteRecordingFiles(userId: string, recordingId: string): Promise<void>;
  getUserStoredBytes(
    userId: string,
    exclude?: { recordingId: string; idx: number }
  ): Promise<number>;
  exists(key: string): Promise<boolean>;
}

export class DiskBlobStore implements BlobStore {
  private readonly baseDir: string;

  constructor(audioDir: string) {
    this.baseDir = resolve(audioDir);
  }

  buildPartKey(
    userId: string,
    recordingId: string,
    idx: number,
    ext: AllowedAudioExtension
  ): string {
    if (!UUID_REGEX.test(userId)) {
      throw new Error('Invalid userId for blob key');
    }
    if (!UUID_REGEX.test(recordingId)) {
      throw new Error('Invalid recordingId for blob key');
    }
    if (!Number.isSafeInteger(idx) || idx < 0) {
      throw new Error('Invalid part index for blob key');
    }
    if (!(ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new InvalidAudioFormatError();
    }
    return `${userId}/${recordingId}/${idx}.${ext}`;
  }

  resolveFilePath(key: string): string {
    const parts = key.split('/');
    if (parts.length !== 3) {
      throw new Error('Invalid blob key format');
    }
    const [userId, recordingId, fileName] = parts;
    if (!UUID_REGEX.test(userId) || !UUID_REGEX.test(recordingId)) {
      throw new Error('Invalid blob key identifiers');
    }
    if (!/^\d+\.(webm|m4a|mp4|mp3|wav|ogg)$/.test(fileName)) {
      throw new Error('Invalid blob key filename');
    }

    const fullPath = resolve(this.baseDir, userId, recordingId, fileName);
    if (!fullPath.startsWith(this.baseDir + sep)) {
      throw new Error('Path traversal rejected');
    }
    return fullPath;
  }

  async savePartFromStream(input: SavePartInput): Promise<SavePartResult> {
    const {
      userId,
      recordingId,
      idx,
      stream,
      maxBytes = DEFAULT_MAX_PART_BYTES,
      quotaMaxBytes,
    } = input;
    if (!UUID_REGEX.test(userId) || !UUID_REGEX.test(recordingId)) {
      throw new Error('Invalid identifiers for audio upload');
    }
    if (!Number.isSafeInteger(idx) || idx < 0) {
      throw new Error('Invalid part index');
    }

    const headerChunks: Buffer[] = [];
    let headerBytes = 0;
    let detectedExt: AllowedAudioExtension | null = null;
    let blobKey = '';
    let finalPath = '';
    let tempPath = '';
    let writeStream: ReturnType<typeof createWriteStream> | null = null;
    let totalBytes = 0;

    const writeChunk = (ws: ReturnType<typeof createWriteStream>, chunk: Buffer): Promise<void> =>
      new Promise((res, rej) => {
        const onError = (err: Error) => {
          ws.removeListener('drain', onDrain);
          rej(err);
        };
        const onDrain = () => {
          ws.removeListener('error', onError);
          res();
        };
        if (ws.write(chunk)) {
          res();
        } else {
          ws.once('error', onError);
          ws.once('drain', onDrain);
        }
      });

    const closeStream = (ws: ReturnType<typeof createWriteStream>): Promise<void> =>
      new Promise((res, rej) => {
        ws.end((err?: Error | null) => {
          if (err) rej(err);
          else res();
        });
      });

    try {
      for await (const rawChunk of stream) {
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
        if (chunk.length === 0) continue;

        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          throw new BlobTooLargeError(maxBytes);
        }
        if (quotaMaxBytes !== undefined && totalBytes > quotaMaxBytes) {
          throw new BlobQuotaExceededError(quotaMaxBytes);
        }

        if (!detectedExt) {
          headerChunks.push(chunk);
          headerBytes += chunk.length;

          if (headerBytes >= 16) {
            const combined = Buffer.concat(headerChunks, headerBytes);
            detectedExt = detectAudioExtension(combined);
            if (!detectedExt) {
              throw new InvalidAudioFormatError();
            }

            blobKey = this.buildPartKey(userId, recordingId, idx, detectedExt);
            finalPath = this.resolveFilePath(blobKey);
            await mkdir(dirname(finalPath), { recursive: true });
            tempPath = `${finalPath}.tmp.${randomUUID()}`;
            writeStream = createWriteStream(tempPath);
            await writeChunk(writeStream, combined);
            headerChunks.length = 0;
          }
        } else if (writeStream) {
          await writeChunk(writeStream, chunk);
        }
      }

      // If total stream was < 16 bytes, check whatever arrived
      if (!detectedExt) {
        const combined = Buffer.concat(headerChunks, headerBytes);
        detectedExt = detectAudioExtension(combined);
        if (!detectedExt) {
          throw new InvalidAudioFormatError();
        }

        blobKey = this.buildPartKey(userId, recordingId, idx, detectedExt);
        finalPath = this.resolveFilePath(blobKey);
        await mkdir(dirname(finalPath), { recursive: true });
        tempPath = `${finalPath}.tmp.${randomUUID()}`;
        writeStream = createWriteStream(tempPath);
        await writeChunk(writeStream, combined);
      }

      if (writeStream) {
        await closeStream(writeStream);
        writeStream = null;
      }

      // Remove any previous file for the same part idx with a different extension
      const recDir = dirname(finalPath);
      const entries = await readdir(recDir).catch(() => [] as string[]);
      for (const entry of entries) {
        if (entry.startsWith(`${idx}.`) && !entry.includes('.tmp.') && join(recDir, entry) !== finalPath) {
          await rm(join(recDir, entry), { force: true }).catch(() => {});
        }
      }

      await rename(tempPath, finalPath);
      return {
        blobKey,
        ext: detectedExt,
        sizeBytes: totalBytes,
      };
    } catch (err) {
      if (writeStream) {
        writeStream.destroy();
      }
      if (tempPath) {
        await rm(tempPath, { force: true }).catch(() => {});
      }
      throw err;
    }
  }

  createReadStream(key: string): Readable {
    const fullPath = this.resolveFilePath(key);
    return createReadStream(fullPath);
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveFilePath(key);
    await rm(fullPath, { force: true });
  }

  async deleteRecordingFiles(userId: string, recordingId: string): Promise<void> {
    if (!UUID_REGEX.test(userId) || !UUID_REGEX.test(recordingId)) {
      throw new Error('Invalid identifiers for audio deletion');
    }
    const dirPath = resolve(this.baseDir, userId, recordingId);
    if (!dirPath.startsWith(this.baseDir + sep)) {
      throw new Error('Path traversal rejected');
    }
    await rm(dirPath, { recursive: true, force: true });
  }

  async getUserStoredBytes(
    userId: string,
    exclude?: { recordingId: string; idx: number }
  ): Promise<number> {
    if (!UUID_REGEX.test(userId)) {
      return 0;
    }
    const userDir = resolve(this.baseDir, userId);
    if (!userDir.startsWith(this.baseDir + sep)) {
      return 0;
    }

    const recDirs = await readdir(userDir).catch(() => [] as string[]);
    let total = 0;

    for (const recId of recDirs) {
      if (!UUID_REGEX.test(recId)) continue;
      const recDir = join(userDir, recId);
      const files = await readdir(recDir).catch(() => [] as string[]);
      for (const fileName of files) {
        if (fileName.includes('.tmp.')) continue;
        if (
          exclude &&
          exclude.recordingId === recId &&
          fileName.startsWith(`${exclude.idx}.`)
        ) {
          continue;
        }
        const st = await stat(join(recDir, fileName)).catch(() => null);
        if (st && st.isFile()) {
          total += st.size;
        }
      }
    }

    return total;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const fullPath = this.resolveFilePath(key);
      await access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

export async function streamToBase64(stream: Readable): Promise<string> {
  const parts: string[] = [];
  let carry: Buffer = Buffer.alloc(0);

  for await (const rawChunk of stream) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    const combined = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
    const remainder = combined.length % 3;
    const encodeLen = combined.length - remainder;

    if (encodeLen > 0) {
      parts.push(combined.subarray(0, encodeLen).toString('base64'));
    }
    carry = remainder > 0 ? Buffer.from(combined.subarray(encodeLen)) : Buffer.alloc(0);
  }

  if (carry.length > 0) {
    parts.push(carry.toString('base64'));
  }

  return parts.join('');
}
