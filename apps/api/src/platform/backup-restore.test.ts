import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const BACKUP_SH = path.join(REPO_ROOT, 'deploy/backup.sh');
const RESTORE_SH = path.join(REPO_ROOT, 'deploy/restore.sh');

const HAS_BASH = (() => {
  try {
    execFileSync('bash', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!HAS_BASH)('deploy/backup.sh and deploy/restore.sh round-trip', () => {
  it('archives audio without nesting extra directory and restores DB to TARGET_DB without swallowing errors', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mindspace-backup-test-'));
    const fakeBin = path.join(tmpRoot, 'bin');
    const sourceAudioDir = path.join(tmpRoot, 'audio-source');
    const restoredAudioDir = path.join(tmpRoot, 'audio-restored');
    const backupDir = path.join(tmpRoot, 'backups');
    const restoreLog = path.join(tmpRoot, 'restore.log');

    try {
      fs.mkdirSync(fakeBin, { recursive: true });
      fs.mkdirSync(path.join(sourceAudioDir, 'rec-123'), { recursive: true });
      fs.writeFileSync(path.join(sourceAudioDir, 'rec-123', 'part-0.webm'), 'audio-bytes-0');

      // Mock pg_dump, pg_restore, psql in PATH so backup.sh/restore.sh run deterministically in CI/dev containers
      const pgDumpStub = path.join(fakeBin, 'pg_dump');
      fs.writeFileSync(
        pgDumpStub,
        `#!/usr/bin/env bash
set -euo pipefail
echo "PGDUMP:$*"
`
      );
      fs.chmodSync(pgDumpStub, 0o755);

      const psqlStub = path.join(fakeBin, 'psql');
      fs.writeFileSync(
        psqlStub,
        `#!/usr/bin/env bash
set -euo pipefail
echo "PSQL:$*" >> "${restoreLog}"
`
      );
      fs.chmodSync(psqlStub, 0o755);

      const pgRestoreStub = path.join(fakeBin, 'pg_restore');
      fs.writeFileSync(
        pgRestoreStub,
        `#!/usr/bin/env bash
set -euo pipefail
echo "PGRESTORE:$*" >> "${restoreLog}"
if [ "\${FAIL_PG_RESTORE:-0}" = "1" ]; then
  exit 2
fi
`
      );
      fs.chmodSync(pgRestoreStub, 0o755);

      const env = {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        BACKUP_DIR: backupDir,
        AUDIO_DIR: sourceAudioDir,
        DATABASE_URL: 'postgres://mindspace:mindspace@postgres:5432/mindspace',
      };

      const backupOut = execFileSync('bash', [BACKUP_SH], { env, encoding: 'utf8' });
      const tsMatch = /BACKUP_TIMESTAMP=(\S+)/.exec(backupOut);
      expect(tsMatch).not.toBeNull();
      const timestamp = tsMatch![1];

      // Restore into TARGET_DB and TARGET_AUDIO_DIR
      execFileSync('bash', [RESTORE_SH, timestamp], {
        env: {
          ...env,
          TARGET_DB: 'mindspace_restore_test',
          TARGET_AUDIO_DIR: restoredAudioDir,
        },
        encoding: 'utf8',
      });

      // Audio file must be at <restoredAudioDir>/rec-123/part-0.webm, NOT nested under audio-source/
      const restoredFile = path.join(restoredAudioDir, 'rec-123', 'part-0.webm');
      expect(fs.existsSync(restoredFile)).toBe(true);
      expect(fs.readFileSync(restoredFile, 'utf8')).toBe('audio-bytes-0');

      // pg_restore must have targeted mindspace_restore_test, not the source mindspace DB
      const logContent = fs.readFileSync(restoreLog, 'utf8');
      expect(logContent).toContain(
        '-d postgres://mindspace:mindspace@postgres:5432/mindspace_restore_test'
      );

      // Verify restore.sh fails (non-zero exit) when pg_restore fails instead of swallowing with || true
      expect(() =>
        execFileSync('bash', [RESTORE_SH, timestamp], {
          env: {
            ...env,
            TARGET_DB: 'mindspace_restore_test',
            TARGET_AUDIO_DIR: restoredAudioDir,
            FAIL_PG_RESTORE: '1',
          },
          encoding: 'utf8',
        })
      ).toThrow();
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
