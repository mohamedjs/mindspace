# 12 Production hardening

## Goal
The stack is ready to run on one server behind a domain.

## Tasks
- `docker-compose.prod.yml`: Caddy with automatic HTTPS, internal networks, resource limits, no dev mounts. SSE must pass unbuffered.
- `deploy/backup.sh`: nightly `pg_dump` and audio archive with retention, plus a tested restore script.
- Security headers, CORS checks, rate limits per route, request size limits.
- Graceful shutdown tests for `api` and `worker`.
- `load/` scripts using `autocannon`: read-heavy notes, and a concurrent pipeline against a fake provider. Report real numbers on this machine only.
- `docs/v2/DEPLOY.md`: server size, DNS, env, first run, updates, rollback, restore.
- Re-check every finding in `AUDIT.md`, listing the test that proves each is closed.

## Acceptance checks
Standard check, `docker compose -f docker-compose.prod.yml config`, a backup then restore round trip, and the load report.

## Decisions
