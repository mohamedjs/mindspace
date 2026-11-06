# MindSpace v2: TypeScript backend, Next.js frontend

**Status:** approved direction, implementation in phases. branch `v2/backend`, cut from `main`.
`main` stays the working Supabase version. This branch is the standalone version.

| Layer | Choice |
|---|---|
| Backend | TypeScript on Node.js 26 LTS, modular monolith |
| Frontend | Next.js 16 modular monolith, TanStack Query, Yup |
| Database | PostgreSQL 18 |
| Cache and pub/sub | Redis 8 |
| Speech to text | Hosted, through OpenRouter, same models as today |
| Sticky notes | The model the user picks, OpenRouter or their own key |
| Packaging | Docker Compose |

## Reference material, read before each phase

The earlier FastAPI plan already solved the product questions. Reuse it, replacing Python with TypeScript. `AUDIT.md` overrides it wherever they conflict.

| Need | Source |
|---|---|
| Every table, enum, trigger, RPC | `docs/fastapi-migration/01-current-surface.md`, `supabase/migrations/` |
| Who may do what | `docs/fastapi-migration/04-authorization.md` |
| HTTP contract and error codes | `docs/fastapi-migration/05-api-contract.md` |
| Known bugs, decide before porting | `docs/fastapi-migration/11-risks-open-questions.md` |
| Business logic to port | `supabase/functions/`, after reading `AUDIT.md` |
| A worked port in Python | `git show feat/fastapi-migration:services/api/app/...` |

Where this file disagrees with those, this file wins.

## Why TypeScript on Node.js

The workload is waiting, not computing: uploads, speech-to-text, LLM calls and status streams. That needs concurrency, which Node's event loop handles well, and not CPU parallelism. Go would save memory, but its main advantage would go unused here.

- All existing backend logic is already TypeScript, so prompts, layout, extraction and payments port with less risk.
- Web, mobile, MCP and API share one language and shared contracts.
- Capacity grows by adding `api` and `worker` containers. Long jobs run in `worker`, so they never block HTTP.

Rule: never do heavy CPU work on the event loop. Audio is streamed to disk, never buffered, and bcrypt uses its thread pool.

## Decisions that differ from the FastAPI plan

1. **There is a job queue.** A recording must survive a closed tab, a restart, and provider rate limits, and long audio can outlast an HTTP request. The queue is the `recordings` table itself, claimed with `FOR UPDATE SKIP LOCKED`. No queue library and no broker.
2. **No MinIO.** Audio lives on a Docker volume behind a `BlobStore` interface. One machine needs nothing more. Add an S3 implementation when there are two machines.
3. **The server orchestrates the pipeline.** Today the client calls transcribe, then extract, then marks complete. In v2 the client uploads and requests processing, then watches a stream. A closed tab can no longer strand a recording.
4. **The server enforces the recording cap,** closing the gap noted in README section 10.
5. **Go was considered and dropped.** See the section above.
6. **No compat layer.** v2 does not run alongside Supabase, so `/functions/*` routes and dual JWT validation are dropped.

## Packages

Pin exact versions. Add nothing else without review.

| Concern | Package | Version |
|---|---|---|
| HTTP | `fastify` | 5.12.8 |
| Plugins | `@fastify/cors`, `@fastify/cookie`, `@fastify/multipart`, `@fastify/rate-limit` | 11.4.1, 11.1.5, 10.1.8, 11.2.2 |
| SQL | `kysely` with `pg`, no ORM | 0.29.8, 8.23.1 |
| Migrations | `node-pg-migrate` | 9.0.0 |
| Redis | `ioredis` | 6.0.0 |
| Tokens | `jose` | 6.2.15 |
| Passwords | `bcrypt` | 6.0.0 |
| Validation | `yup`, shared with the web app | 1.7.1 |
| Logs | `pino` | 10.4.0 |
| Concurrency limits | `p-limit` | 7.3.3 |
| Tests | `vitest`, against the Compose Postgres and Redis | 5.1.0 |

Frontend adds `yup`, removes `@supabase/*` and `zod`, and keeps everything else.

## Backend structure

```
apps/api/
  src/
    main.http.ts               starts Fastify
    main.worker.ts             starts the pipeline workers
    composition.ts             the only place modules are wired together
    platform/                  config, db, cache, blob, http, auth, logger, clock
    modules/
      <module>/
        domain/                entities, errors, port interfaces. No imports from outside.
        application/           one use case per file
        infrastructure/        Kysely repositories and external adapters
        presentation/          routes, Yup schemas, mappers
        index.ts               the module's only public export
  migrations/
  seed/
packages/contracts/            Yup schemas and types shared with apps/web
```

### Modules

| Module | Owns tables | Responsibility |
|---|---|---|
| `auth` | users, profiles (identity columns), refresh_tokens, password_reset_tokens | Sign-up, sign-in, tokens, account |
| `spaces` | spaces | CRUD, soft delete |
| `notes` | sticky_notes, relationships, note_groups | Notes, bulk move, groups, relations, ingest |
| `timeline` | timeline_events | Event log |
| `recordings` | recordings, recording_parts, transcripts | Upload, split, queue, status stream |
| `transcription` | none | Hosted speech-to-text behind one port |
| `ai` | ai_models, ai_actions, ai_action_items | Model resolution, prompts, extraction, layout |
| `credits` | profiles (money columns), credit_ledger, credit_reservations, credit_packages | Reserve, settle, release, grant |
| `byok` | user_ai_keys | Encrypted user keys |
| `billing` | subscriptions, subscription_plans, payments | Plans, subscribe, entitlements |

### Dependency rules

1. `domain` imports nothing outside itself.
2. `application` imports its own `domain` and `platform/clock` only.
3. A module imports another only through ports wired in `composition.ts`, never through its internals.
4. Only `credits/infrastructure` may write `credits_balance` or `credits_reserved`.
5. Every query on user data filters by `user_id`. Foreign-owned rows return 404.

An architecture test fails the build on any violation.

## Product surfaces

| Surface | Lives in | Talks to |
|---|---|---|
| API and worker | `apps/api` | Postgres, Redis, disk, AI providers |
| Web | `apps/web` | API |
| iOS and Android | `apps/mobile` | API |
| Meeting extension | `apps/extension`, Chrome MV3 | API |
| Landing page | `apps/site`, static | GitHub Pages |

## Meeting mode

1. The user clicks the extension in a meeting tab and accepts a consent notice.
2. An offscreen document records tab audio mixed with the microphone. A new `MediaRecorder` starts every 5 minutes, because `timeslice` chunks are not independently playable.
3. Each finished part uploads at once, retrying with backoff. Parts wait in IndexedDB until uploaded, so a crash loses at most the current part.
4. On stop, the client calls finish. The worker transcribes parts with bounded concurrency, joins them by index, then extracts.
5. The meeting becomes its own space, with notes, relationships, and a mind map view.

Every recording, of any length, is one or more `recording_parts`, so there is a single pipeline and retries work per part. Long single-file uploads are split on the server with ffmpeg.

## Rules from the audit

Each closes a finding in `AUDIT.md`, and each needs a test.

| Rule | Closes |
|---|---|
| Money logic has no client path. Clients never call credit functions. | C1, C2, H1 |
| Every ID from a client is checked against `user_id` before use. | H2, H3 |
| Duration comes from the server probing the file, never from the client. | H4 |
| Plan limits are enforced server-side. | H5 |
| Charges are capped at the reservation, and work and settlement share a transaction. | H6 |
| Payment, grant and activation share one transaction. | H7 |
| `baseUrl` is not accepted from users, and every key is validated. | M1, M2 |
| Every database and provider error is handled, and clients see only codes. | M3, M6, M8 |
| One active key per provider, enforced by a partial unique index. | M3 |
| Refills write the real delta. | M4 |
| Schema comes only from migrations. | M7 |
| The server runs the pipeline. | M10 |
| The prompt gets a bounded, relevant subset of notes. | P1 |
| Sweeps touch only affected rows. | P2 |
| Every external call has a deadline, with long audio split into chunks. | P3 |
| Audio streams from disk to the provider. | P6 |

Frontend: virtualize the canvas, memoize notes, update caches in place, and paginate long lists (P4, P5).

## Code conventions

- Use cases are small classes or functions taking ports as parameters.
- Errors are typed `AppError(code, status, message)`. The envelope is always `{"error": code, "message": text}`.
- JSON is `snake_case` and row-shaped, so `mappers.ts` keeps working.
- `strict` TypeScript, no `any`.
- Every external call has an `AbortSignal` deadline.
- Tests: unit tests for domain and application, and a real Postgres for repositories and HTTP.

## Concurrency model

```
upload -> POST /recordings/{id}/process -> status 'queued'
                                              |
    worker claims rows with FOR UPDATE SKIP LOCKED
                                              |
    transcribing -> extracting -> completed / failed
         |                |
   stt slots           llm slots
```

| Control | Default | Reason |
|---|---|---|
| `STT_CONCURRENCY` | 16 | Waiting on the network, bounded by the provider's rate limit |
| `LLM_CONCURRENCY` | 16 | Waiting on the network, bounded by the provider's rate limit |
| `PIPELINE_WORKERS` | 32 | Concurrent jobs per worker process. Add worker containers to scale. |
| `DB_MAX_CONNS` | 20 | Bound on Postgres load |

- Each limit is a `p-limit` instance, one per worker process.
- Add `queued` to `recording_status`. A woken worker claims; workers also poll every 2 seconds, so a lost wake-up costs 2 seconds at most.
- `claimed_at` lets a sweeper requeue a job stuck for over 15 minutes after a crash. Three attempts, then `failed`.
- Transcripts are saved before extraction, so a retry never re-transcribes.
- Shutdown stops claiming, then waits up to 30 seconds. Anything unfinished is requeued by the sweeper.

Status updates go to Redis channel `recording:{id}`. `GET /recordings/{id}/events` is Server-Sent Events that first sends the row's current status, then forwards the channel, so a stream works across restarts.

## Redis

Redis holds nothing that cannot be rebuilt. If it is down, cached reads fall through to Postgres, and status streams fall back to polling the row every 2 seconds.

| Use | Key | TTL |
|---|---|---|
| Model list | `cache:models` | 5 min |
| Plan list | `cache:plans` | 5 min |
| Entitlements | `cache:entitlements:{user}` | 60 s, deleted on subscription change |
| Rate limit | `rl:{route}:{user}` | window |
| Pipeline wake-up | channel `pipeline:wake` | none |
| Status events | channel `recording:{id}` | none |

## Speech to text

Transcription stays hosted, exactly as `supabase/functions/transcribe` does today: OpenRouter, the seeded `transcribe` models, and the same credit formula. All the heavy work happens at the provider, so the API server only waits on the network.

- `transcription` has one port, `Transcriber`, with one adapter, `openrouter`. Another engine can be added later as a second adapter without touching `recordings`.
- Model selection stays data-driven through `ai_models`.

Local Whisper was measured and deliberately left out. On 4 CPU cores `large-v3-turbo` processed 60 seconds of audio in 19 seconds, about 3x real time at 2.1 GB RAM. That capacity is too small for a public app, and it would tie machine size to the number of users.

## Frontend structure

`apps/web` already has the right shape, so this is a swap of adapters and not a rewrite.

```
apps/web/src/
  core/domain, core/ports      unchanged, these are the contracts
  infrastructure/
    api/                       NEW: client.ts, mappers.ts, one repository per port, sse.ts
    container.ts               points at api/ instead of supabase/
  features/<feature>/
    components/  hooks/  schemas/      schemas are Yup
  shared/
```

- Server state is TanStack Query only, with keys defined per feature. Zustand is for UI state only.
- Forms validate with Yup in `features/<feature>/schemas/`. Server validation stays authoritative.
- `src/core/architecture.test.ts` keeps guarding the layers. Features never import `infrastructure/api` directly.
- The access token stays in memory. The refresh token is an `httpOnly`, `Secure`, `SameSite=Lax` cookie set by the API.
- `apps/web/src/app/api/*` is removed. The agent surface moves to `apps/api`, and `apps/mcp` points there.

## Out of scope for v2's first release

- Importing production data from Supabase. v2 starts with an empty database.
- Real payment channels and subscription renewal, which are separate work.

## Phases

See `docs/v2/plans/README.md`.
