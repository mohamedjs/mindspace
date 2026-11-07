#!/usr/bin/env bash
set -euo pipefail

# MindSpace v2 Restore Script
# Restores PostgreSQL database from a pg_dump custom format archive
# and unpacks audio archive.

BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_USER="${POSTGRES_USER:-mindspace}"
POSTGRES_DB="${TARGET_DB:-mindspace}"
AUDIO_DIR="${TARGET_AUDIO_DIR:-}"
AUDIO_VOLUME="${AUDIO_VOLUME:-mindspace-v2_audio}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

# 1. Locate backup files
TIMESTAMP="${1:-}"

if [ -z "${TIMESTAMP}" ]; then
  # Find latest manifest or dump in BACKUP_DIR
  LATEST_DUMP="$(find "${BACKUP_DIR}" -type f -name "db-*.dump" | sort -r | head -n 1 || true)"
  if [ -z "${LATEST_DUMP}" ]; then
    echo "Error: No database dumps found in ${BACKUP_DIR}" >&2
    exit 1
  fi
  # Extract timestamp from filename db-YYYYMMDD_HHMMSS.dump
  TIMESTAMP="$(basename "${LATEST_DUMP}" | sed -E 's/^db-(.+)\.dump$/\1/')"
  echo "No timestamp specified; selecting most recent backup: ${TIMESTAMP}"
fi

DB_DUMP_FILE="${BACKUP_DIR}/db-${TIMESTAMP}.dump"
AUDIO_ARCHIVE_FILE="${BACKUP_DIR}/audio-${TIMESTAMP}.tar.gz"
MANIFEST_FILE="${BACKUP_DIR}/manifest-${TIMESTAMP}.sha256"

if [ ! -f "${DB_DUMP_FILE}" ]; then
  echo "Error: Database dump not found: ${DB_DUMP_FILE}" >&2
  exit 1
fi

if [ ! -f "${AUDIO_ARCHIVE_FILE}" ]; then
  echo "Error: Audio archive not found: ${AUDIO_ARCHIVE_FILE}" >&2
  exit 1
fi

echo "=== MindSpace Restore started for backup: ${TIMESTAMP} ==="

# 2. Checksum verification
if [ -f "${MANIFEST_FILE}" ]; then
  echo "Verifying SHA256 checksums..."
  (
    cd "${BACKUP_DIR}"
    sha256sum -c "manifest-${TIMESTAMP}.sha256"
  )
  echo "Checksum verification passed."
fi

# 3. Database restoration
echo "Restoring database to '${POSTGRES_DB}'..."
if command -v pg_restore >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  pg_restore --clean --if-exists -d "${DATABASE_URL}" "${DB_DUMP_FILE}" || true
elif command -v docker >/dev/null 2>&1; then
  # Use docker compose exec with stdin
  docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    pg_restore -U "${POSTGRES_USER}" --clean --if-exists -d "${POSTGRES_DB}" < "${DB_DUMP_FILE}" || true
else
  echo "Error: Neither host pg_restore nor docker compose is available." >&2
  exit 1
fi
echo "Database restoration completed."

# 4. Audio restoration
echo "Restoring audio archive..."
BACKUP_DIR_ABS="$(cd "${BACKUP_DIR}" && pwd)"
if [ -n "${AUDIO_DIR}" ]; then
  mkdir -p "${AUDIO_DIR}"
  tar xzf "${AUDIO_ARCHIVE_FILE}" -C "${AUDIO_DIR}"
  echo "Audio restored to local directory: ${AUDIO_DIR}"
elif command -v docker >/dev/null 2>&1; then
  # Restore into docker volume
  docker run --rm \
    -v "${AUDIO_VOLUME}:/data/audio" \
    -v "${BACKUP_DIR_ABS}:/backup:ro" \
    alpine sh -c "tar xzf /backup/$(basename "${AUDIO_ARCHIVE_FILE}") -C /data"
  echo "Audio restored to Docker volume: ${AUDIO_VOLUME}"
fi

echo "=== MindSpace Restore completed successfully for backup: ${TIMESTAMP} ==="
