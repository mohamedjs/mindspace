# 01 Foundation

## Goal
`docker compose up` starts Postgres, Redis, the API and the worker, with the full schema applied and seeded. No business features.

## Stack and packages
Exact versions from ARCHITECTURE.md. Node 26 LTS via image `node:26-alpine`. Postgres `postgres:18.6-alpine`, Redis `redis:8.8.4-alpine`. Migrations are plain SQL files run by node-pg-migrate.

## Structure
```
docker-compose.yml   .env.example
apps/api/package.json (name @mindspace/api)  tsconfig.json  Dockerfile  vitest.config.ts
apps/api/migrations/0001_baseline.sql
apps/api/seed/seed.sql
apps/api/src/main.http.ts  main.worker.ts  main.migrate.ts  composition.ts
apps/api/src/platform/config.ts  db.ts  cache.ts  clock.ts  logger.ts
apps/api/src/platform/http/errors.ts  server.ts
apps/api/src/architecture.test.ts
packages/contracts/package.json (name @mindspace/contracts)  src/index.ts
```
Add `packages/*` to root `workspaces`, and add root scripts `api:dev` and `check:api`.

## Compose
Services: `postgres`, `redis` (no host ports), `migrate` (one-shot), `api` (port `${API_PORT:-8080}`), `worker`, and `dev` under profile `tools`: `node:26-alpine`, repo mounted at `/repo`, runs as `${UID:-1000}:${GID:-1000}`. All long-running services have healthchecks. A named volume `audio` is mounted on `api` and `worker` at `/data/audio`.

## Functions
- `config.ts`: reads env, validates with Yup, reports every missing key at once. Keys: `NODE_ENV PORT DATABASE_URL REDIS_URL DB_POOL_MAX JWT_SECRET BYOK_MASTER_KEY CORS_ORIGINS AUDIO_DIR OPENROUTER_API_KEY`. The server refuses to start in production with placeholder secrets.
- `errors.ts`: `AppError(code, status, message)`. The Fastify error handler returns `{"error","message"}`; unknown errors are logged and return `internal_error` with a fixed message, never `err.message`. Yup failures return 422 `validation_error`.
- `server.ts`: `buildServer(deps)` for tests and production. Request id, pino logs with `authorization` and `cookie` redacted, cors, rate-limit (falls back to in-memory if Redis is down), 1 MiB JSON limit.
- `GET /health` no dependencies. `GET /health/ready` is 503 on Postgres failure, and 200 with `"redis":"down"` when only Redis fails.
- `main.worker.ts`: starts and logs, with graceful shutdown. Job logic comes in phase 05.
- `architecture.test.ts`: enforces the Dependency rules by scanning imports, with fixtures proving each rule detects a violation.

## Schema
`0001_baseline.sql` is the final state of every file in `supabase/migrations/`, read in order. Include tables, enums, indexes, constraints, generated columns and data triggers.
- Replace `auth.users` with `users(id, email citext unique, password_hash, display_name, created_at, updated_at)`. Add `refresh_tokens`, `password_reset_tokens` from `docs/fastapi-migration/03-data-model.md`.
- Remove RLS, GRANT/REVOKE, `auth.uid()` defaults, `pg_cron`, `pg_net`, `vector`, realtime and storage statements.
- Remove SQL functions holding business logic. List each in `notes` with the phase that replaces it.
- Add `'queued'` and `'splitting'` to `recording_status`. Add to `recordings`: `claimed_at`, `attempts int default 0`, `process_mode text`, `target_note_id`, `parent_note_id`, `kind text default 'note'` (`note` or `meeting`).
- Add `recording_parts(id, recording_id fk cascade, user_id, idx int, blob_key, duration_ms, status text default 'uploaded', transcript_text, attempts int default 0, error, created_at, unique(recording_id, idx))`.
- Add a partial unique index allowing one active key per user and provider. Drop `base_url` from `user_ai_keys`.
- Add an index for pending work: `recordings(created_at) WHERE status = 'queued'`.
`seed.sql` holds final plans, packages and `ai_models`, idempotent. Replace any default whose model is retired only if a migration already did.

## Tasks
Compose and packages, then platform, then schema and seed, then API and tests.

## Acceptance checks
```
cp -n .env.example .env
docker compose run --rm dev npm install --workspace @mindspace/api --workspace @mindspace/contracts
docker compose run --rm dev npm run check -w @mindspace/api
docker compose up -d --build --wait api worker
curl -fsS localhost:8080/health/ready
docker compose exec postgres psql -U mindspace -d mindspace -c '\dt'
docker compose down
```

## Out of scope
All later phases. `supabase/`, `apps/web`, `apps/mobile` and `apps/mcp` stay unchanged.

## Decisions
