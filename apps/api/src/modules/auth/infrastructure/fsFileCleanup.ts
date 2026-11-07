import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileCleanupPort } from '../domain/ports.js';

export class FsFileCleanup implements FileCleanupPort {
  constructor(private audioDir: string) {}

  async deleteUserFiles(userId: string): Promise<void> {
    const userDir = join(this.audioDir, userId);
    try {
      await rm(userDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist if user had no audio files
    }
  }
}
