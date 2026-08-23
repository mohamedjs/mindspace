# 02 — Target architecture

## Shape

One deployable Python process: a **modular monolith**. Nine business modules,
each owning its tables, its service logic, its routers, and its schemas. No
module imports another module's repository or model directly — cross-module
work goes through the other module's *service*.

```
                 ┌──────────────── HTTP ────────────────┐
                 │  app/main.py  (FastAPI, one app)     │
                 └───────────────┬──────────────────────┘
                                 │ routers
   ┌────────┬────────┬───────────┼──────────┬─────────┬──────────┬─────────┐
   │  auth  │ spaces │   notes   │recordings│   ai    │ credits  │ billing │
   │        │        │           │          │         │          │         │
   │        │        │  timeline │  storage │  byok   │          │         │
   └────────┴────────┴───────────┴──────────┴─────────┴──────────┴─────────┘
                                 │
                        app/core (db, config, errors, security)
```

## Module boundaries

| Module | Owns tables | Owns | Public service API (what other modules may call) |
|---|---|---|---|
| `auth` | `users`, `profiles` (identity columns), `refresh_tokens`, `password_reset_tokens` — *models declared in `app/core/models.py`, see below* | Registration, login, JWT issue/verify, password reset, `current_user` dependency, account deletion orchestration | `AuthService.register/authenticate/issue_tokens`, `AccountService.get_profile/update_display_name/delete_account`, `deps.current_user` |
| `spaces` | `spaces` | Space CRUD, soft delete, `note_count` / `last_activity_at` maintenance | `SpaceService.get_owned(space_id, user_id)`, `SpaceService.touch(space_id)`, `SpaceService.adjust_note_count(space_id, delta)` |
| `notes` | `sticky_notes`, `relationships`, `note_groups` | Note CRUD, soft delete + child promotion, bulk move, groups, relationships | `NoteService.create_many(...)`, `NoteService.list_live(space_id, user_id)`, `NoteService._soft_delete_note(...)` |
| `timeline` | `timeline_events` | Event log | `TimelineService.record_note_event(user_id, space_id, type, ref_id, summary)` |
| `recordings` | `recordings`, `transcripts` | Recording lifecycle, status stream (SSE), transcription orchestration | `RecordingService.get_owned`, `RecordingService.set_status`, `TranscriptionService.transcribe` |
| `storage` | *(no tables)* | MinIO/S3 presign, ownership check on keys, delete | `StorageService.presign_put/presign_get/delete/assert_owns` |
| `ai` | `ai_models`, `ai_actions`, `ai_action_items` | Model resolution, prompts, providers, extraction parsing, layout, apply/undo | `ExtractionService.extract`, `NoteWriteService.write`, `resolve_model` |
| `credits` | `profiles` (balance columns), `credit_ledger`, `credit_reservations`, `credit_packages` | Reserve / settle / release / grant, ledger, monthly refill, stale sweep | `CreditService.reserve/settle/release/grant/get_balance` |
| `byok` | `user_ai_keys` | Encrypt/decrypt, save/list/delete, key resolution with platform fallback | `resolve_api_key(session, user_id, provider, byok_only)`, `KeyService.*` |
| `billing` | `subscriptions`, `subscription_plans`, `payments` | Plans, subscribe start/confirm, payment providers, entitlements | `SubscriptionService.start/confirm`, `EntitlementService.for_user(user_id)` |

### Dependency rules (enforce with an import-lint test — see [10](10-testing.md))

```
allowed (module → module):

  ai         → credits, byok, notes, spaces, recordings, timeline
  recordings → credits, byok, storage, ai(models only), spaces
  billing    → credits
  notes      → spaces, timeline
  spaces     → (nothing)
  credits    → (nothing)
  byok       → (nothing)
  timeline   → (nothing)
  storage    → (nothing)
  auth       → spaces, credits            (registration seeds a space + 100 credits)

forbidden, always:
  * any module importing another module's `repository.py` or `models.py`
  * `credits`, `byok`, `timeline`, `storage`, `spaces` importing anything from app/modules/*
  * a router importing a repository (routers talk to services only)

exempt from both rules:
  * `app/core/models.py` — the two shared identity tables (see below). Any
    module may import from it; it imports from no module.
```

`credits` having **no** outbound dependency on another *module* is the point: it
is the money module, and `grant_credits`' old `REVOKE EXECUTE` becomes "only
`billing` calls `CreditService.grant`, and no router reaches it".

### The `profiles` table is shared between `auth` and `credits` — so its model lives in `core`

`profiles` carries identity columns (`display_name`, `is_anonymous`, `timezone`,
`locale`, `chat_model_id`, `transcribe_model_id`) and money columns
(`credits_balance`, `credits_reserved`, `free_refill_at`). Splitting the table is
out of scope — it would break the data migration for no behavioural gain.

That leaves a genuine conflict: `CreditService.reserve/settle/grant` and
`credits/jobs.py::monthly_free_refill` all UPDATE `profiles`, so `credits` needs
the `Profile` mapped class. If `Profile` lived in `app/modules/auth/models.py`,
`credits` would have to import another module's `models.py` and gain an
outbound dependency — breaking **both** architecture rules above on their first
run.

**Resolution: `User` and `Profile` are declared in `app/core/models.py`**, not in
any module.

- `app/core/models.py` holds exactly four classes: `User`, `Profile`,
  `RefreshToken`, `PasswordResetToken`. It imports only from `app/core/base.py`.
- `auth` and `credits` both import from `app.core.models`. Neither imports the
  other. `credits`' outbound module dependency stays empty.
- The lint test in [10](10-testing.md#architecture-test-test_architecturepy)
  whitelists `app.core.*` explicitly, which it must anyway (`Base`, `get_session`,
  `AppError`).
- The **column split is enforced separately and remains the real rule**:
  `auth` may write identity columns only; `credits` may write money columns
  only; `app/modules/credits/repository.py` is the sole place that emits an
  UPDATE touching `credits_balance` / `credits_reserved` (grep test in
  [04 §Guard 1](04-authorization.md#guard-1)).

Every other table's model stays in its owning module.

## Tech choices

| Concern | Choice | Version | Why |
|---|---|---|---|
| Language | Python | **3.12** | 3.13 free-threading is not needed and some C extensions still lag; 3.12 is the boring pick |
| Web framework | **FastAPI** | `>=0.118,<0.120` | Given. Native Pydantic v2, `lifespan`, `StreamingResponse` for SSE |
| ASGI server | **uvicorn[standard]** | `>=0.35` | `--workers 1` (see [01 §2.8](01-current-surface.md#28-realtime-0018_realtime_recordingssql--sse)) |
| ORM | **SQLAlchemy 2.x** (`AsyncSession`, `Mapped[]`/`mapped_column`) | `>=2.0.36,<2.1` | **Not SQLModel.** The schema has generated columns, partial indexes, native enums, a `bytea` column, and a `bigserial` — all first-class in SQLAlchemy Core and awkward or unsupported in SQLModel. SQLModel also fuses the DB model with the API schema, which is exactly what leaks `encrypted_key` into a response ([04](04-authorization.md#guard-2)) |
| Driver | **asyncpg** | `>=0.30` | `postgresql+asyncpg://`. Note: asyncpg does not support multiple statements per `execute`; the cron reconciliation must be two calls |
| Migrations | **Alembic** | `>=1.14` | One squashed baseline, then normal revisions |
| Validation | **Pydantic v2** + `pydantic-settings` | `>=2.9` / `>=2.7` | Mirrors the Zod schemas in `_shared/extraction.ts` almost one-to-one |
| JWT | **PyJWT** | `>=2.10` | Direct control over `alg`, `iss`, `aud`, and dual-secret verification during cutover. Deliberately **not** `fastapi-users` or `authlib` — both would drag in their own user model and route surface, and the token contract here has to match GoTrue's claim layout |
| Password hashing | **`bcrypt`** (the `bcrypt` package directly, not `passlib`) | `>=4.2` | GoTrue stores bcrypt (`$2a$`/`$2b$`) in `auth.users.encrypted_password`. **Verify this before committing** — see [08 §3](08-data-migration-runbook.md#3-transform-authusers). `passlib` is unmaintained and warns on modern `bcrypt`; call `bcrypt.checkpw` / `bcrypt.hashpw(pw, bcrypt.gensalt(rounds=10))` directly. Rounds: match whatever the dumped hashes use (read the `$2a$NN$` cost field) |
| HTTP client | **httpx** | `>=0.28` | `AsyncClient(timeout=60.0)` reproduces `REQUEST_TIMEOUT_MS = 60_000` |
| Crypto (BYOK) | **cryptography** `AESGCM` | `>=44` | Byte-compatible with `_shared/crypto.ts` |
| Object storage | **aioboto3** | `>=13.2` | S3 API against MinIO; `generate_presigned_url` for PUT and GET |
| Scheduler | **APScheduler** | `>=3.11,<4` | Replaces `pg_cron`. 4.x is still churning; 3.x `AsyncIOScheduler` is stable |
| Task queue | **none** | — | See below |
| Tests | **pytest**, **pytest-asyncio**, **httpx.ASGITransport**, **testcontainers** *or* a compose-provided test DB | `pytest>=8.3` | See [10](10-testing.md) |
| Lint/format | **ruff** | `>=0.9` | One tool for both |
| Dep management | **uv** with `pyproject.toml` + `uv.lock` | `>=0.5` | Fast, lockfile-first, and the Dockerfile stays two `uv sync` layers |

### Background work

There is **no task queue**, deliberately. Transcription is synchronous today:
`runThinkingPipeline` awaits `functions.invoke('transcribe', …)` and
`useRecordingStatus` watches the row for the banner. Keeping it synchronous
preserves behaviour exactly.

Add **arq** (Redis) only when the trigger fires: recordings long enough that a
single `POST /functions/transcribe` routinely exceeds the reverse proxy's
timeout. Today the cap is `subscription_plans.max_recording_minutes` — up to
120 minutes on `max`/`byok`, which *already* would. Record this in
[11](11-risks-open-questions.md#q6); it is the strongest candidate for the first
post-migration change, but it is a behaviour change and therefore out of scope
for a migration.

### Async everywhere

Every route, service, and repository method is `async def`. The one place to be
careful: `bcrypt.hashpw`/`checkpw` are CPU-bound and block the loop for ~100 ms
at cost 10. Wrap them in `await anyio.to_thread.run_sync(...)`.

---

## Directory tree

```
services/api/
├── pyproject.toml                     # deps, ruff, pytest config
├── uv.lock
├── Dockerfile
├── alembic.ini
├── README.md
├── alembic/
│   ├── env.py                         # async engine, target_metadata = Base.metadata
│   ├── script.py.mako
│   └── versions/
│       └── 0001_baseline.py           # squashed end-state of all 28 SQL migrations
├── seeds/
│   ├── __init__.py
│   ├── seed.py                        # idempotent upserts; entrypoint for the `seed` service
│   ├── ai_models.py                   # 10 openrouter + 7 BYOK chat + 3 BYOK transcribe (disabled)
│   ├── plans.py                       # 6 subscription_plans
│   └── packages.py                    # 4 credit_packages
├── app/
│   ├── __init__.py
│   ├── main.py                        # FastAPI(), lifespan, router include, exception handlers, CORS
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py                  # Settings(BaseSettings) — every env var in 07's table
│   │   ├── db.py                      # async_engine, async_session_factory, get_session dependency
│   │   ├── base.py                    # DeclarativeBase + naming_convention (Alembic autogenerate hygiene)
│   │   ├── errors.py                  # AppError + the concrete error classes (one per code in 05)
│   │   ├── exception_handlers.py      # renders {"error": code, "message": text} — see 05
│   │   ├── security.py                # JWT encode/decode (own + Supabase compat), bcrypt hash/verify
│   │   ├── models.py                  # User, Profile, RefreshToken, PasswordResetToken
│   │   │                              #   shared by auth + credits; imports only core/base.py
│   │   ├── pagination.py              # limit/offset params
│   │   └── logging.py                 # structlog-ish JSON logs; never log api keys or tokens
│   ├── modules/
│   │   ├── __init__.py
│   │   ├── auth/
│   │   │   │                          # (no models.py — User/Profile live in app/core/models.py)
│   │   │   ├── schemas.py             # SignInRequest, SignUpRequest, TokenPair, ProfileOut, …
│   │   │   ├── repository.py          # UserRepository, ProfileRepository
│   │   │   ├── service.py             # AuthService, AccountService
│   │   │   ├── deps.py                # current_user, current_user_optional, bearer scheme
│   │   │   ├── tokens.py              # access/refresh issue + rotate; refresh_tokens table helper
│   │   │   └── router.py              # /auth/*
│   │   ├── spaces/
│   │   │   ├── models.py              # Space
│   │   │   ├── schemas.py             # SpaceOut (snake_case: id,name,emoji,note_count,last_activity_at)
│   │   │   ├── repository.py
│   │   │   ├── service.py
│   │   │   └── router.py              # /spaces
│   │   ├── notes/
│   │   │   ├── models.py              # StickyNote, Relationship, NoteGroup
│   │   │   ├── enums.py               # NoteType, RelType, SourceType
│   │   │   ├── schemas.py             # NoteOut (NOTE_COLUMNS shape), NoteCreate, NoteMove, GroupOut…
│   │   │   ├── repository.py
│   │   │   ├── service.py             # incl. _soft_delete_note (child promotion), move_many
│   │   │   └── router.py              # /spaces/{id}/notes, /notes/*, /spaces/{id}/groups, /groups/*
│   │   ├── timeline/
│   │   │   ├── models.py              # TimelineEvent
│   │   │   ├── schemas.py
│   │   │   ├── repository.py
│   │   │   ├── service.py             # record_note_event
│   │   │   └── router.py              # /spaces/{id}/timeline
│   │   ├── recordings/
│   │   │   ├── models.py              # Recording, Transcript
│   │   │   ├── enums.py               # RecordingStatus (7 values)
│   │   │   ├── schemas.py             # RecordingOut (nested transcripts + sticky_notes), …
│   │   │   ├── repository.py
│   │   │   ├── service.py             # RecordingService
│   │   │   ├── transcription.py       # TranscriptionService — the `transcribe` edge function
│   │   │   ├── events.py              # in-process pub/sub broker for SSE
│   │   │   └── router.py              # /recordings/*, /spaces/{id}/recordings, SSE endpoint
│   │   ├── storage/
│   │   │   ├── service.py             # StorageService (aioboto3), assert_owns
│   │   │   └── router.py              # /storage/recordings/presign, /storage/recordings/sign
│   │   ├── ai/
│   │   │   ├── models.py              # AiModel, AiAction, AiActionItem
│   │   │   ├── enums.py               # AiActionKind, AiActionStatus, ProviderId, ModelKind
│   │   │   ├── schemas.py
│   │   │   ├── repository.py
│   │   │   ├── model_resolver.py      # resolve_model  ← _shared/models.ts
│   │   │   ├── extraction.py          # parse_extraction, extract_json_block, colour + parent rules
│   │   │   ├── layout.py              # slot_rect, layout_new_notes, radial_child_rect, place_child
│   │   │   ├── clock.py               # build_clock(timezone) — zoneinfo, en-CA date + weekday
│   │   │   ├── prompts/
│   │   │   │   ├── extract_thoughts.py
│   │   │   │   └── write_note.py
│   │   │   ├── providers/
│   │   │   │   ├── __init__.py        # openrouter = openai_compatible("https://openrouter.ai/api/v1")
│   │   │   │   └── openai_compatible.py
│   │   │   ├── service.py             # ExtractionService, NoteWriteService, AiActionService
│   │   │   └── router.py              # /ai/*, /models
│   │   ├── credits/
│   │   │   ├── models.py              # CreditLedger, CreditReservation, CreditPackage
│   │   │   ├── enums.py               # LedgerReason
│   │   │   ├── schemas.py             # BalanceOut, LedgerEntryOut
│   │   │   ├── repository.py          # THE ONLY writer of credits_balance / credits_reserved
│   │   │   ├── service.py             # reserve, settle, release, grant, get_balance, list_ledger
│   │   │   ├── jobs.py                # monthly_free_refill, sweep_stale_reservations
│   │   │   └── router.py              # /credits/*
│   │   ├── byok/
│   │   │   ├── models.py              # UserAiKey
│   │   │   ├── schemas.py             # UserKeyOut — encrypted_key MUST NOT appear
│   │   │   ├── crypto.py              # AES-GCM, iv||ct, key_hint
│   │   │   ├── repository.py
│   │   │   ├── resolver.py            # resolve_api_key + PROVIDER_BASE_URL
│   │   │   ├── service.py             # KeyService
│   │   │   └── router.py              # /keys
│   │   └── billing/
│   │       ├── models.py              # Subscription, SubscriptionPlan, Payment
│   │       ├── enums.py               # PaymentChannel, SubscriptionStatus
│   │       ├── schemas.py
│   │       ├── repository.py
│   │       ├── service.py             # SubscriptionService, EntitlementService
│   │       ├── payments/
│   │       │   ├── base.py            # PaymentProvider protocol, ChargeIntent, VerificationResult
│   │       │   ├── registry.py        # payment_provider_for, list_providers
│   │       │   ├── test_pay.py
│   │       │   ├── google_pay.py
│   │       │   ├── apple_pay.py
│   │       │   └── instapay.py
│   │       └── router.py              # /billing/*
│   ├── compat/
│   │   ├── __init__.py
│   │   └── functions_router.py        # POST/GET /functions/{name} → the 7 module services
│   └── scheduler.py                   # APScheduler wiring, started from lifespan
└── tests/
    ├── conftest.py                    # db fixture, app fixture, user factory, auth_client
    ├── factories.py
    ├── test_architecture.py           # module dependency lint (mirrors core/architecture.test.ts)
    ├── test_error_envelope.py
    ├── test_authorization_matrix.py   # THE cross-user leak matrix — see 10
    ├── modules/
    │   ├── test_auth.py
    │   ├── test_spaces.py
    │   ├── test_notes.py
    │   ├── test_timeline.py
    │   ├── test_recordings.py
    │   ├── test_storage.py
    │   ├── test_ai_extraction.py      # ports extraction.test.ts cases
    │   ├── test_ai_layout.py          # ports layout.test.ts cases
    │   ├── test_credits.py
    │   ├── test_byok_crypto.py        # decrypts a blob produced by _shared/crypto.ts
    │   └── test_billing.py
    └── compat/
        └── test_functions_router.py   # the 7 legacy paths, request/response parity
```

Repo-root additions:

```
docker-compose.yml
Makefile
.env.example                  (extended — see 07)
services/web/Dockerfile       (or apps/web/Dockerfile; 07 uses apps/web/Dockerfile)
```

## The compat layer, and why it exists

`app/compat/functions_router.py` exposes `POST /functions/{name}` and
`GET /functions/{name}` for the seven names the clients already use
(`transcribe`, `ai-extract`, `ai-note-write`, `byok-save`, `byok-delete`,
`subscribe-start`, `subscribe-confirm`). It is a thin dispatch table onto the
same services the RESTful routes call.

Keeping it means `FunctionsPort.invoke(name, body)` in both clients needs only
its **base URL** changed, and `apps/web/src/app/api/functions/[name]/route.ts`
needs only its target changed. That collapses the frontend diff for the AI
pipeline to two one-line edits, and it is what makes the strangler-fig cutover
in [09](09-phases.md#strangler-fig-option) tractable.

Delete `app/compat/` in a later, separate change once both clients have moved to
the RESTful paths.
