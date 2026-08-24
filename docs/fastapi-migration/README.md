# MindSpace: Supabase → FastAPI modular monolith

**Status:** plan only. Nothing in this folder has been implemented.
**Audience:** an AI or engineer with access to this repo and *no other context*.
Everything you need is here plus the files it names.

## What this migration does

| Today | After |
|---|---|
| Supabase hosted Postgres + PostgREST + GoTrue + Storage + Realtime + Deno edge functions | One Python FastAPI app (`services/api`) on plain PostgreSQL 16 |
| 7 Deno edge functions in `supabase/functions/` | 9 Python modules under `app/modules/` |
| 28 SQL migrations + RLS policies | Alembic, single squashed baseline + application-layer authorization |
| `pg_cron` (2 jobs) | APScheduler inside the API process |
| Supabase Storage bucket `recordings` | MinIO (S3-compatible), same key layout |
| Supabase Realtime `postgres_changes` on `recordings` | Server-Sent Events `GET /recordings/{id}/events` |
| Supabase Auth (GoTrue) issues JWTs | **FastAPI issues JWTs**, and accepts Supabase-issued ones during cutover |
| `npm run dev` (web + mobile only; backend is remote) | `make dev` → `docker compose up` brings up postgres + minio + migrations + seed + api + web |

The mobile app's **behaviour does not change**. Only
`apps/mobile/src/infrastructure/supabase/*` (and the web twin) are replaced.

## Read in this order

| File | What it holds |
|---|---|
| [01-current-surface.md](01-current-surface.md) | Exhaustive inventory: every edge function, every migration, every table/enum/index/trigger/cron job/RPC, with a named FastAPI destination for each |
| [02-target-architecture.md](02-target-architecture.md) | Module boundaries, dependency rules, full directory tree, tech choices with versions |
| [03-data-model.md](03-data-model.md) | Table → SQLAlchemy model, enum translation, `auth.users` → `users` |
| [04-authorization.md](04-authorization.md) | **The RLS chapter.** Policy by policy, table by table, plus the four non-policy grants that carry business rules |
| [05-api-contract.md](05-api-contract.md) | Endpoint-by-endpoint table: method, path, schemas, auth, what it replaces — including the agent/ingest surface the MCP server calls |
| [06-frontend-cutover.md](06-frontend-cutover.md) | Exactly which files in `apps/web` and `apps/mobile` change, and which of them get deleted rather than ported |
| [07-docker.md](07-docker.md) | Dockerfiles, `docker-compose.yml`, `.env.example`, the one command |
| [08-data-migration-runbook.md](08-data-migration-runbook.md) | Dump, transform, verify, roll back |
| [09-phases.md](09-phases.md) | Ordered checkable tasks, acceptance criteria, rollback notes, strangler-fig option |
| [10-testing.md](10-testing.md) | pytest layout + the authorization test matrix |
| [11-risks-open-questions.md](11-risks-open-questions.md) | Known bugs found during research, decisions the plan deliberately defers |

## The five decisions that everything else follows from

1. **FastAPI issues tokens.** Not Supabase Auth. `POST /auth/sign-in` returns
   `{access_token, refresh_token}`; the `AuthPort` in `core/ports/index.ts` is
   already narrow enough that the mobile app cannot tell the difference.
   During cutover the API *also* validates Supabase-issued HS256 JWTs against
   `SUPABASE_JWT_SECRET`, so both backends honour the same session and you can
   flip one repository at a time. See [04](04-authorization.md#a-auth-tokens).

2. **The API speaks snake_case row shapes.** `apps/*/src/infrastructure/supabase/mappers.ts`
   already maps `NOTE_COLUMNS` / `SPACE_COLUMNS` / `GROUP_COLUMNS` rows to
   domain objects, and `repositories.ts` + `noteRepository.ts` are **byte-identical**
   between web and mobile. Return the same column names and `mappers.ts` needs
   *zero* changes. See [06](06-frontend-cutover.md).

3. **The error envelope is `{"error": code, "message": text}`.** Both clients'
   `functions.ts` parse exactly that and raise `PipelineError(code, …)`, which
   the UI switches on. FastAPI's default `{"detail": …}` would silently collapse
   the whole error taxonomy into one generic apology. Non-negotiable, tested in
   phase 1. See [05](05-api-contract.md#error-envelope).

4. **RLS becomes service-layer authorization, not a clever ORM trick.** Today
   every edge function writes through a *service-role* client that bypasses RLS
   entirely, and RLS only guards the direct PostgREST path. FastAPI has one DB
   user and no bypass, so the rule "who may write this" moves wholly into
   Python. The failure mode to guard against is a client-facing endpoint doing
   something only an edge function could. See [04](04-authorization.md).

5. **No task queue.** Transcription is synchronous today — the client awaits the
   edge function and `useRecordingStatus` watches the row. Keep it synchronous.
   Add arq/Celery only when recordings routinely exceed the HTTP timeout.
   See [02](02-target-architecture.md#background-work).
