import { execFile } from 'node:child_process';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import type { AllowedAudioExtension, RecordingPart } from '../domain/entities.js';
import type { AudioMediaPort, BlobStorePort } from '../domain/ports.js';

const execFileAsync = promisify(execFile);

export class FfmpegMediaAdapter implements AudioMediaPort {
  constructor(private readonly blobStore: BlobStorePort) {}

  async probeDurationMs(blobKey: string): Promise<number> {
    const filePath = this.blobStore.resolveFilePath(blobKey);
    return this.probeFileDurationMs(filePath);
  }

  private async probeFileDurationMs(filePath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          filePath,
        ],
        { timeout: 30_000 }
      );

      const seconds = Number.parseFloat(stdout.trim());
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.max(1, Math.round(seconds * 1000));
      }
    } catch {
      // Fall through to stream/decode fallback
    }

    // Fallback for headerless streams (e.g. live WebM): decode to null and parse final time=
    const { stderr } = await execFileAsync(
      'ffmpeg',
      ['-hide_banner', '-i', filePath, '-f', 'null', '-'],
      { timeout: 60_000 }
    );

    const matches = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      const hours = Number.parseInt(last[1], 10);
      const mins = Number.parseInt(last[2], 10);
      const secs = Number.parseFloat(last[3]);
      const totalSeconds = hours * 3600 + mins * 60 + secs;
      if (Number.isFinite(totalSeconds) && totalSeconds > 0) {
        return Math.max(1, Math.round(totalSeconds * 1000));
      }
    }

    throw new Error(`Unable to probe audio duration for ${filePath}`);
  }

  async splitPart(input: {
    userId: string;
    recordingId: string;
    part: RecordingPart;
    segmentSeconds: number;
  }): Promise<Array<{ tempFilePath: string; ext: AllowedAudioExtension; durationMs: number }>> {
    const inputPath = this.blobStore.resolveFilePath(input.part.blobKey);
    const ext = (input.part.blobKey.split('.').pop() || 'webm') as AllowedAudioExtension;
    const tempDir = join(dirname(inputPath), `.split_${input.part.idx}_${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    const outPattern = join(tempDir, `chunk_%04d.${ext}`);

    let splitSucceeded = false;
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          inputPath,
          '-f',
          'segment',
          '-segment_time',
          String(input.segmentSeconds),
          '-c',
          'copy',
          outPattern,
        ],
        { timeout: 120_000 }
      );
      const files = (await readdir(tempDir)).filter((f) => f.startsWith('chunk_')).sort();
      if (files.length >= 2) {
        splitSucceeded = true;
      }
    } catch {
      splitSucceeded = false;
    }

    if (!splitSucceeded) {
      // Clean any partial files and re-encode into segments
      const existing = await readdir(tempDir).catch(() => [] as string[]);
      for (const f of existing) {
        await rm(join(tempDir, f), { force: true }).catch(() => {});
      }

      await execFileAsync(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          inputPath,
          '-f',
          'segment',
          '-segment_time',
          String(input.segmentSeconds),
          outPattern,
        ],
        { timeout: 120_000 }
      );
    }

    const chunkFiles = (await readdir(tempDir)).filter((f) => f.startsWith('chunk_')).sort();
    const results: Array<{ tempFilePath: string; ext: AllowedAudioExtension; durationMs: number }> =
      [];

    for (const file of chunkFiles) {
      const fullChunkPath = join(tempDir, file);
      const durationMs = await this.probeFileDurationMs(fullChunkPath);
      results.push({
        tempFilePath: fullChunkPath,
        ext,
        durationMs,
      });
    }

    return results;
  }

  async stagePartToTemp(blobKey: string): Promise<string> {
    const srcPath = this.blobStore.resolveFilePath(blobKey);
    const tempPath = `${srcPath}.stage.${randomUUID()}`;
    await rename(srcPath, tempPath);
    return tempPath;
  }

  async moveSplitChunk(
    tempFilePath: string,
    userId: string,
    recordingId: string,
    newIdx: number,
    ext: AllowedAudioExtension
  ): Promise<string> {
    const targetKey = this.blobStore.buildPartKey(userId, recordingId, newIdx, ext);
    const targetPath = this.blobStore.resolveFilePath(targetKey);
    await mkdir(dirname(targetPath), { recursive: true });
    await rename(tempFilePath, targetPath);

    // Clean up parent temp directory if it was a .split_* folder and is now empty
    const parentDir = dirname(tempFilePath);
    if (parentDir.includes('.split_')) {
      const remaining = await readdir(parentDir).catch(() => ['non-empty']);
      if (remaining.length === 0) {
        await rm(parentDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    return targetKey;
  }
}
