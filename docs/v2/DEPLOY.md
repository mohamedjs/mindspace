# MindSpace v2 Production Deployment Guide

Production deployment guide for running the standalone MindSpace stack (Next.js web, Fastify API, worker, PostgreSQL 18, Redis 8, and Caddy reverse proxy) on a single server behind a custom domain.

---

## 1. Server Sizing

| Component | Minimum | Recommended | Notes |
|---|---|---|---|
| **vCPU** | 2 cores | 4 cores | Workload is I/O- and network-bound (waiting on STT/LLM providers) |
| **RAM** | 4 GB | 8 GB | Node.js processes, Postgres buffer cache, Redis in-memory cache |
| **Disk** | 40 GB NVMe | 80 GB+ NVMe | Postgres data, local audio storage volume, Docker images |
| **OS** | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS | Modern Linux kernel with Docker Engine 27+ |

**Rationale:** Heavy AI computing (speech-to-text and LLM extraction) runs at external providers (OpenRouter/BYOK). Audio is streamed directly to disk, and bcrypt uses its thread pool. Capacity scales vertically by adjusting `PIPELINE_WORKERS` and `DB_POOL_MAX`.

---

## 2. DNS Configuration

Create standard DNS A (and optional AAAA) records with your DNS provider:

| Host / Subdomain | Type | Target | Purpose |
|---|---|---|---|
| `yourdomain.com` (or `@`) | `A` | `<Server IPv4>` | Web frontend (Next.js) |
| `api.yourdomain.com` | `A` | `<Server IPv4>` | Backend HTTP API & SSE status streams |

*Caddy automatically requests, provisions, and renews TLS certificates via Let's Encrypt and ZeroSSL over ports 80 and 443.*

---

## 3. Environment & Secrets

Create the production environment file (e.g. `/etc/mindspace/prod.env` or `.env` alongside `docker-compose.prod.yml`), chmod `600`:

```bash
# General
NODE_ENV=production
DOMAIN=yourdomain.com
API_DOMAIN=api.yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# PostgreSQL & Redis
POSTGRES_USER=mindspace
POSTGRES_PASSWORD=<strong-random-db-password>
POSTGRES_DB=mindspace
DATABASE_URL=postgres://mindspace:<strong-random-db-password>@postgres:5432/mindspace
REDIS_URL=redis://redis:6379
DB_POOL_MAX=20

# Cryptographic Keys (Must be high-entropy, no placeholder text)
# Generate with: openssl rand -hex 32
JWT_SECRET=c8f8b89e3a6285749bfbc4e5264b73b5e478546123498acbd12589e47265bc10

# Generate with: openssl rand -base64 32
# IMPORTANT: Back up this key securely. Losing BYOK_MASTER_KEY makes user encrypted API keys permanently unrecoverable!
BYOK_MASTER_KEY=4gX31uXwP/x3bM0zQ/Vl25h8K9J7yL0k1m2n3o4p5q8=

# CORS & Networking
CORS_ORIGINS=https://yourdomain.com
AUDIO_DIR=/data/audio

# Hosted Provider
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Concurrency tuning
PIPELINE_WORKERS=32
STT_CONCURRENCY=16
LLM_CONCURRENCY=16

# Security Rule: Never enable ALLOW_TEST_PAY in production (API startup refuses to boot if true)
ALLOW_TEST_PAY=false
```

---

## 4. First Run

1. **Verify Docker and Compose:**
   ```bash
   docker --version
   docker compose version
   ```

2. **Validate the compose configuration:**
   ```bash
   docker compose -f docker-compose.prod.yml config
   ```

3. **Start PostgreSQL, Redis, and apply migrations:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d postgres redis
   docker compose -f docker-compose.prod.yml run --rm migrate
   ```

4. **Launch the entire stack:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

5. **Verify health status:**
   ```bash
   docker compose -f docker-compose.prod.yml ps
   curl -fsS http://localhost:8080/health/ready
   curl -fsS https://api.yourdomain.com/health/ready
   ```

---

## 5. Updates & Zero-Downtime Deploys

1. **Fetch latest code:**
   ```bash
   cd /srv/mindspace/app
   git pull origin v2/backend
   ```

2. **Rebuild images:**
   ```bash
   docker compose -f docker-compose.prod.yml build
   ```

3. **Apply database migrations:**
   ```bash
   docker compose -f docker-compose.prod.yml run --rm migrate
   ```

4. **Restart services gracefully:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps api worker web caddy
   ```

In-flight requests complete cleanly before API exits; background worker finishes active jobs within 30 seconds before exiting.

---

## 6. Rollback

If a bad deployment occurs:

1. **Revert Git revision or tag:**
   ```bash
   git checkout <previous-commit-or-tag>
   ```

2. **Rebuild or repoint images:**
   ```bash
   docker compose -f docker-compose.prod.yml build
   docker compose -f docker-compose.prod.yml up -d
   ```

3. **Database schema compatibility:**
   Migrations follow expand/contract patterns. If a rollback requires undoing a database migration:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm api npm run migrate down
   ```

---

## 7. Backup & Disaster Recovery

### Automated Nightly Backups
MindSpace includes `deploy/backup.sh` which creates:
- Compressed PostgreSQL database archive (`pg_dump -Fc`)
- Audio archive (`audio-*.tar.gz`)
- Cryptographic SHA256 verification manifest (`manifest-*.sha256`)
- Automatic retention policy pruning backups older than 14 days

Add to cron (`crontab -e`):
```bash
0 3 * * * cd /srv/mindspace/app && ./deploy/backup.sh >> /var/log/mindspace-backup.log 2>&1
```

### Full Disaster Recovery (Restore)
To restore the database and audio files from backup:

```bash
# Restore latest backup:
./deploy/restore.sh

# Or restore a specific backup timestamp:
./deploy/restore.sh 20261107_190000

# Or restore into a staging/recovery database:
TARGET_DB=mindspace_recovery ./deploy/restore.sh 20261107_190000
```

The restore script automatically validates SHA256 checksums, restores tables via `pg_restore --clean --if-exists`, and restores the audio volume.
