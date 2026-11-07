#!/usr/bin/env bash
set -euo pipefail

# MindSpace v2 Nightly Backup Script
# Creates a compressed PostgreSQL database dump (pg_dump -Fc)
# and an archive of the audio files directory/volume with retention.

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
POSTGRES_USER="${POSTGRES_USER:-mindspace}"
POSTGRES_DB="${POSTGRES_DB:-mindspace}"
AUDIO_DIR="${AUDIO_DIR:-}"
AUDIO_VOLUME="${AUDIO_VOLUME:-mindspace-v2_audio}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "${BACKUP_DIR}"
BACKUP_DIR_ABS="$(cd "${BACKUP_DIR}" && pwd)"

DB_DUMP_FILE="${BACKUP_DIR}/db-${TIMESTAMP}.dump"
AUDIO_ARCHIVE_FILE="${BACKUP_DIR}/audio-${TIMESTAMP}.tar.gz"
MANIFEST_FILE="${BACKUP_DIR}/manifest-${TIMESTAMP}.sha256"

echo "=== MindSpace Backup started: ${TIMESTAMP} ==="
echo "Target backup directory: ${BACKUP_DIR_ABS}"

# 1. Database dump
echo "Backing up PostgreSQL database '${POSTGRES_DB}'..."
if command -v pg_dump >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  pg_dump -Fc "${DATABASE_URL}" > "${DB_DUMP_FILE}"
elif command -v docker >/dev/null 2>&1; then
  # Use docker compose exec on the running postgres service
  docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    pg_dump -U "${POSTGRES_USER}" -Fc "${POSTGRES_DB}" > "${DB_DUMP_FILE}"
else
  echo "Error: Neither host pg_dump nor docker compose is available." >&2
  exit 1
fi

DB_SIZE="$(stat -c %s "${DB_DUMP_FILE}" 2>/dev/null || stat -f %z "${DB_DUMP_FILE}" 2>/dev/null || echo "0")"
echo "Database dump completed: ${DB_DUMP_FILE} (${DB_SIZE} bytes)"

# 2. Audio archive
echo "Backing up audio files..."
if [ -n "${AUDIO_DIR}" ] && [ -d "${AUDIO_DIR}" ]; then
  tar czf "${AUDIO_ARCHIVE_FILE}" -C "$(dirname "${AUDIO_DIR}")" "$(basename "${AUDIO_DIR}")"
elif command -v docker >/dev/null 2>&1; then
  # Use a lightweight container with the audio volume attached
  docker run --rm \
    -v "${AUDIO_VOLUME}:/data/audio:ro" \
    -v "${BACKUP_DIR_ABS}:/backup" \
    alpine sh -c "tar czf /backup/$(basename "${AUDIO_ARCHIVE_FILE}") -C /data audio 2>/dev/null || tar czf /backup/$(basename "${AUDIO_ARCHIVE_FILE}") -C /data ."
else
  echo "Warning: Audio directory not found and Docker unavailable; creating empty audio archive." >&2
  tar czf "${AUDIO_ARCHIVE_FILE}" --files-from /dev/null
fi

AUDIO_SIZE="$(stat -c %s "${AUDIO_ARCHIVE_FILE}" 2>/dev/null || stat -f %z "${AUDIO_ARCHIVE_FILE}" 2>/dev/null || echo "0")"
echo "Audio archive completed: ${AUDIO_ARCHIVE_FILE} (${AUDIO_SIZE} bytes)"

# 3. Checksums
echo "Generating checksums..."
cd "${BACKUP_DIR_ABS}"
sha256sum "$(basename "${DB_DUMP_FILE}")" "$(basename "${AUDIO_ARCHIVE_FILE}")" > "$(basename "${MANIFEST_FILE}")"
echo "Manifest created: ${MANIFEST_FILE}"

# 4. Retention cleanup (delete backups older than RETENTION_DAYS)
echo "Applying retention policy (${RETENTION_DAYS} days)..."
find "${BACKUP_DIR_ABS}" -type f \( -name "db-*.dump" -o -name "audio-*.tar.gz" -o -name "manifest-*.sha256" \) -mtime "+${RETENTION_DAYS}" -exec rm -f {} +

echo "=== MindSpace Backup completed successfully: ${TIMESTAMP} ==="
echo "BACKUP_TIMESTAMP=${TIMESTAMP}"
echo "DB_DUMP=${DB_DUMP_FILE}"
echo "AUDIO_ARCHIVE=${AUDIO_ARCHIVE_FILE}"
echo "MANIFEST=${MANIFEST_FILE}"
