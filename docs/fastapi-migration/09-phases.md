# 09 — Phased execution plan

Every task is checkable. Every phase has acceptance criteria and a rollback
note. Work them in order; within a phase, tasks are ordered but often
parallelisable.

**Rule for the whole plan:** do not delete `supabase/` until Phase 12. It is the
reference implementation and the rollback target.

---

## Phase 0 — Scaffolding

- [ ] `services/api/pyproject.toml` with the dependency set from [02](02-target-architecture.md#tech-choices); `uv lock`
- [ ] `services/api/Dockerfile` per [07](07-docker.md#servicesapidockerfile)
- [ ] `docker-compose.yml` with `postgres` + `minio` only, both healthchecked
- [ ] `.env.example` extended per [07](07-docker.md#envexample-replaces-the-current-14-line-file); `.env` gitignored (check `.gitignore` already covers it)
- [ ] `Makefile` with `dev`, `down`, `clean`, `psql`, `sh`, `test`, `lint`
- [ ] `app/main.py` with `/health` only; `app/core/config.py::Settings`
- [ ] `app/core/db.py` — `create_async_engine`, `async_sessionmaker(expire_on_commit=False)`, `get_session` dependency
- [ ] `app/core/errors.py` + `app/core/exception_handlers.py` emitting `{"error","message"}`
- [ ] `tests/conftest.py` with a per-test transaction-rollback DB fixture and an `httpx.AsyncClient(transport=ASGITransport(app))` fixture
- [ ] `ruff` configured; `make lint` green

**Acceptance:** `make dev` starts postgres + minio + api; `curl localhost:8000/health` returns `{"status":"ok"}`; `make test` runs zero tests successfully; `make lint` passes.
**Rollback:** delete `services/api/`, `docker-compose.yml`, `Makefile`. Nothing else in the repo is touched.

---

## Phase 1 — Schema, migrations, seed

- [ ] `app/core/base.py` — `Base` + naming convention
- [ ] All 11 enums as `str, Enum` classes in their owning modules ([01 §2.2](01-current-surface.md#22-enums-0002_enumssql-0009_recording_status_extractingsql-0024_subscriptionssql))
- [ ] All 21 SQLAlchemy models per [03](03-data-model.md): the 18 existing tables, plus `users`, `refresh_tokens`, `password_reset_tokens`
- [ ] `alembic/env.py` wired to the async engine and `Base.metadata`
- [ ] `alembic/versions/0001_baseline.py` — hand-reviewed, containing: all enums (7 labels on `recording_status`), all tables, **every index from [01 §2.4](01-current-surface.md#24-indexes) with an explicit name**, both generated columns, all check constraints, all unique constraints, the two `profiles → ai_models` FKs added after both tables exist
- [ ] `seeds/seed.py` + `seeds/{ai_models,plans,packages}.py` — idempotent, end-state values from [01 §2.10](01-current-surface.md#210-seed-data-supabaseseedsql--inline-inserts-in-migrations)
- [ ] `seeds/bucket.py` — create the private `recordings` bucket
- [ ] compose gets `migrate` and `seed` services with `service_completed_successfully` dependencies
- [ ] `app/core/exception_handlers.py` covered by `tests/test_error_envelope.py`

**Acceptance:**
- `make clean && make dev` reaches a running api with zero manual steps.
- `alembic downgrade base && alembic upgrade head` is clean.
- `alembic revision --autogenerate -m check` produces an **empty** migration (proves models and baseline agree).
- Running `seed` twice changes nothing (`select count(*) from ai_models` stable at 20 — 5 openrouter chat + 5 openrouter transcribe + 7 BYOK chat + 3 BYOK transcribe, no provider overlap so nothing collapses on conflict; `subscription_plans` at 6, `credit_packages` at 4).
- `psql` shows `enum_range(null::recording_status)` = 7 labels.
- A test asserts every non-2xx response body has exactly the keys `error` and `message` (plus the documented extras).

**Rollback:** `make clean`. No client is pointed here yet.

---

## Phase 2 — Auth

- [ ] `app/core/security.py` — `create_access_token`, `decode_access_token` (dual-secret), `hash_password`/`verify_password` via `bcrypt` in a thread
- [ ] `app/modules/auth/{models,schemas,repository,service,tokens,deps,router}.py`
- [ ] `AuthService.register()` reproducing `handle_new_user()` + `0022_default_space` **in one transaction**: `users`, `profiles` (100 credits, `free_refill_at = current_date`), `credit_ledger` (`+100`, `signup_grant`), `spaces` (`'My MindSpace'`, `'lightbulb'`)
- [ ] `current_user` dependency; 401 body `{"error":"unauthorized","message":"missing Authorization header"}`
- [ ] Refresh-token rotation with hash storage
- [ ] `/auth/reset-password` returning 202 unconditionally
- [ ] `AccountService` — `get_profile` (with the `full_name` fallback chain), `update_display_name`, `delete_account`
- [ ] `tests/modules/test_auth.py`, incl. a Supabase-signed-token acceptance test and a rejection test with `SUPABASE_JWT_SECRET` unset

**Acceptance:**
- Sign up → sign in → call `/account/profile` with the returned token.
- A fresh sign-up leaves exactly one space, `credits_balance = 100`, and one `signup_grant` ledger row.
- A token signed with `SUPABASE_JWT_SECRET` authenticates; with the setting unset it 401s.
- Deleting an account cascades: zero rows remain in `spaces`, `sticky_notes`, `user_ai_keys` for that id.
- Every route except the five public ones has `current_user` (route-walking test).

**Rollback:** nothing external depends on this yet.

---

## Phase 3 — Core CRUD (spaces, notes, groups, timeline)

- [ ] `spaces` module — list/create/rename/soft-delete
- [ ] `notes` module — all ten `NoteRepository` methods, **every one taking `user_id`**
- [ ] `NoteService._soft_delete_note()` — the single choke point for soft delete + child promotion, used by both the DELETE route and (later) `undo_ai_action`
- [ ] `NoteService.move_many()` — one `UPDATE … FROM (VALUES …)`, scoped to `user_id` and `deleted_at is null`
- [ ] `timeline` module — `record_note_event()` reproducing `on_note_change()` exactly, **including the position-only early return** and the `note_count` / `last_activity_at` maintenance
- [ ] `notes` groups CRUD
- [ ] `GET /spaces/{id}/relationships`, `GET /spaces/{id}/timeline` (read-only)
- [ ] Agent surface — `POST /spaces/{id}/ingest`, `POST`/`DELETE /relationships` ([05 §16](05-api-contract.md#agent-surface)); port `structure.ts` from `apps/web/src/lib/api/` **with its test**, and wrap the whole ingest in one transaction rather than reproducing the soft-delete rollback
- [ ] `tests/modules/test_notes.py`, `test_spaces.py`, `test_timeline.py`, `test_ingest.py`

**Acceptance:**
- Creating a note bumps `spaces.note_count` and writes a `note_created` event.
- Moving a note writes **no** timeline event and does not bump `last_activity_at` beyond the trigger's behaviour.
- Soft-deleting a parent sets every child's `parent_id` to null and writes `note_deleted` and decrements `note_count` (floored at 0).
- Editing only `x`/`y` via `/notes/{id}/content` is impossible (schema has no x/y).
- `moveMany` with 30 notes issues **one** statement.
- The MCP server, pointed at this API by changing `MINDSPACE_API_URL` alone, runs `list_spaces` and one `ingest_notes` successfully — no code change in `apps/mcp`. If it needs one, the routes drifted from the contract.
- A failed ingest leaves **no** partial tree (transaction, not compensating delete).
- No repository method exists without a `user_id` parameter (grep test).

**Rollback:** revert the module; nothing else depends on it yet.

---

## Phase 4 — Credits

- [ ] `credits` module: `reserve`, `settle`, `release`, `grant`, `get_balance`, `list_ledger`
- [ ] `reserve` uses `SELECT credits_balance - credits_reserved … FOR UPDATE` inside `async with session.begin()`; raises `InsufficientCreditsError` → 402 `insufficient_credits`
- [ ] `settle` uses `FOR UPDATE` on the reservation; writes a ledger row **only when `actual > 0`**
- [ ] `release` is a silent no-op on a missing/non-`held` reservation
- [ ] `credits/jobs.py` — `monthly_free_refill`, `sweep_stale_reservations` (both statements, including the full reconciliation UPDATE)
- [ ] `app/scheduler.py` + lifespan wiring, gated on `RUN_SCHEDULER`, with an advisory lock per job
- [ ] The Guard-1 invariant: `extra="forbid"` on profile-patch schemas + the grep test from [04](04-authorization.md#guard-1)
- [ ] `tests/modules/test_credits.py` including a **concurrency test**: two simultaneous `reserve(60)` against a balance of 100 → exactly one succeeds, one 402s

**Acceptance:**
- The concurrency test passes reliably (run it 20×).
- `settle(reservation, 0, action_id)` leaves the ledger untouched but frees the reservation.
- A failed provider call leaves `credits_balance` unchanged and the reservation `released`.
- `sweep_stale_reservations` repairs a hand-corrupted `credits_reserved`.
- `grep -rn "credits_balance\s*[=:]" app/` matches only `app/modules/credits/repository.py`.

**Rollback:** revert. No money has moved — the target DB has no traffic.

---

## Phase 5 — BYOK & storage

- [ ] `byok/crypto.py` byte-compatible with `_shared/crypto.ts`
- [ ] `tests/modules/test_byok_crypto.py` decrypting a **hard-coded blob produced by the Deno implementation**
- [ ] `byok/resolver.py` — `PROVIDER_BASE_URL` verbatim, user key → platform key → `byok_required`/`no_platform_key`/`unsupported_provider`
- [ ] `byok` module CRUD; `UserKeyOut` with the exact seven fields; `list_for_user` selecting **columns, not the entity**
- [ ] `app/core/logging.py` redaction filter
- [ ] `storage` module — aioboto3, dual endpoint (internal vs public), `assert_owns`, presign PUT/GET, size + MIME validation
- [ ] `tests/modules/test_storage.py` — a key with someone else's uid prefix is rejected

**Acceptance:**
- The Deno-produced ciphertext decrypts to the known plaintext.
- `GET /keys` response JSON contains no `encrypted_key`, no `\x`, no plaintext (assert on the raw body string).
- A presigned PUT to `otheruser/space/rec.m4a` is refused with 403 before MinIO is touched.
- A presigned URL returned by the API is reachable from the host (proves `S3_PUBLIC_ENDPOINT_URL`).

**Rollback:** revert the modules. `BYOK_MASTER_KEY` is read-only at this stage.

---

## Phase 6 — Recordings, transcription, SSE

- [ ] `recordings` module — CRUD, nested `RecordingOut`
- [ ] `recordings/events.py` — in-process broker; `RecordingService.set_status` publishes
- [ ] `GET /recordings/{id}/events` — SSE, first frame is current state, 15 s keepalive, closes on terminal status
- [ ] `ai/providers/openai_compatible.py` — `chat`, `transcribe`, `transcribe_via_chat`, 60 s timeout → 504 `provider_timeout`, non-2xx → 502 `provider_error`
- [ ] `ai/model_resolver.py` — `resolve_model` with all three branches, **including the chat-only "prefer a provider the user holds a key for"** step and the deliberate absence of it for transcribe
- [ ] `TranscriptionService.transcribe()` — the eleven steps of `transcribe/index.ts` in order, including `status='extracting'` on success and the free-plan audio deletion
- [ ] `tests/modules/test_recordings.py` with a stubbed provider

**Acceptance:**
- End-to-end with a stub provider: create recording → presign → upload → transcribe → a `transcripts` row exists, `status = 'extracting'`, credits moved by exactly `ceil(6 * minutes * multiplier)`.
- A provider 500 leaves `status='failed'`, `error` populated, and **credits unchanged**.
- A provider hang past 60 s returns 504 `provider_timeout` and releases the reservation.
- An SSE client receives the current status immediately and every subsequent transition.
- A free-plan user's `storage_path` is nulled and the MinIO object is gone after transcription.

**Rollback:** revert. Supabase still serves the pipeline.

---

## Phase 7 — AI extraction & note-write

- [ ] `ai/prompts/extract_thoughts.py` and `write_note.py` — prompt strings copied **verbatim**, versions `extract_thoughts@8` / `write_note@1`
- [ ] `ai/clock.py` — `build_clock(timezone)` using `zoneinfo`, `en-CA`-style `YYYY-MM-DD` and English weekday, falling back to UTC on a bad IANA name
- [ ] `ai/extraction.py` — Pydantic mirrors of the Zod schemas, `extract_json_block`, `parse_extraction` (dedupe, ambiguous-parent drop, self-reference drop, `MAX_NOTES = 8`), `color_for_note`, `resolve_parent_id`
- [ ] `ai/layout.py` — `slot_rect`, `layout_new_notes`, `radial_child_rect`, `place_child`, constants verbatim
- [ ] `tests/modules/test_ai_extraction.py` and `test_ai_layout.py` **ported case-for-case from `apps/web/src/features/ai/schemas/extraction.test.ts` and `services/layout.test.ts`** — those files are the executable spec
- [ ] `ExtractionService.extract()` — full `ai-extract` flow: ownership checks, focus-note resolution *within the space's live notes*, UUID pre-generation, parent resolution, top-level grid + child orbit placement, `ai_actions` insert, bulk note insert, `ai_action_items` insert, relationship insert, settle
- [ ] **Timeline parity:** the bulk insert must emit a `note_created` event per note and bump `note_count`/`last_activity_at`, matching the trigger it replaces
- [ ] `NoteWriteService.write()` — append-vs-replace, title-only-if-blank, `due_at` only when present, empty-output early return
- [ ] `AiActionService.apply()` / `.undo()` (see [11 §Q3](11-risks-open-questions.md#q3) before deciding)
- [ ] `ai/router.py` + `app/compat/functions_router.py`

**Acceptance:**
- Every ported layout and extraction test passes, unchanged in intent from the TS originals.
- A stubbed extraction of 5 notes produces 5 non-overlapping rects, children orbiting their parents.
- An empty extraction returns `{aiActionId, noteIds: [], creditsCharged: 0}`, writes the `ai_actions` row, settles 0, and inserts no notes.
- `ai-note-write` on a note with content appends after a blank line; on `'New note'` it replaces.
- The timeline contains one event per AI-created note.
- `POST /functions/ai-extract` and `POST /ai/extract` return byte-identical bodies.

**Rollback:** revert. The compat router is additive.

---

## Phase 8 — Billing

- [ ] `billing/payments/base.py` — `VerificationResult` as a discriminated union on `status`, `ProviderNotConfiguredError` carrying `channel` + `missing`
- [ ] The four providers, with the three scaffolds still raising
- [ ] `registry.py` — `payment_provider_for` (400 on unknown), `list_providers`
- [ ] `SubscriptionService.start()` — the free-plan branch (immediately active, `channel='test_pay'`, +100 years, **no payments row**) and the paid branch
- [ ] `SubscriptionService.confirm()` — verify → **payments insert** → grant, with `IntegrityError` on `(channel, external_ref)` → `alreadyActive: true`; amount mismatch → 402; `total_credits == 0` → no grant
- [ ] `EntitlementService` and `ai_enabled` on `/billing/plans`
- [ ] `tests/modules/test_billing.py` including a double-confirm idempotency test

**Acceptance:**
- Two `confirm()` calls with the same receipt grant credits exactly once; the second returns `alreadyActive: true`.
- An unconfigured provider returns **501** with `channel` and `missing[]`, not 500.
- `ALLOW_TEST_PAY` unset makes `test_pay` verification fail with `test_pay_disabled`.
- `/billing/plans` includes `ai_enabled` and returns 6 rows.

**Rollback:** revert. No real payment provider is wired.

---

## Phase 9 — Authorization hardening

- [ ] `tests/test_authorization_matrix.py` — the full cross-user matrix from [10](10-testing.md#authorization-test-matrix), parametrised over the table list
- [ ] `tests/test_architecture.py` — module dependency lint per [02](02-target-architecture.md#dependency-rules-enforce-with-an-import-lint-test--see-10)
- [ ] The four guard tests from [04 §C](04-authorization.md#c-the-four-non-policy-artifacts-the-ones-that-get-hand-waved)
- [ ] Route-walking test: every route has `current_user` except the five public ones
- [ ] Route-shape test: no route path contains `{user_id}`; no write route under `/timeline`
- [ ] Schema test: no request schema anywhere declares `user_id`, `credits_balance`, or `credits_reserved`

**Acceptance:** all of the above green, and **adding a new table without adding it to the matrix fails the parametrised test** (the matrix is driven off `Base.metadata.tables`).
**Rollback:** n/a — tests only. Do not proceed past this phase with any of them failing.

---

## Phase 10 — Frontend adapters (web first)

- [ ] `apps/web/src/infrastructure/api/` — the eight files from [06](06-frontend-cutover.md#new-folder-in-both-apps)
- [ ] `apps/web/src/infrastructure/container.ts` — switch imports, keep the export name `supabaseContainer`
- [ ] `apps/web/src/app/api/functions/[name]/route.ts` — retarget to `${API_BASE_URL}/functions/${name}`
- [ ] `apps/web/src/proxy.ts` — local JWT check instead of `createServerClient`
- [ ] `apps/web/src/infrastructure/api/server.ts` replacing `supabase/server.ts`
- [ ] `NEXT_PUBLIC_API_URL` in `.env.example` and compose
- [ ] Extend `FORBIDDEN_IMPORTS` in `core/architecture.test.ts` with `/@supabase\/ssr/`
- [ ] `npm run typecheck && npm test` in `apps/web`

**Acceptance — click through every screen against the new API:**
- [ ] Sign up, sign out, sign in, reset-password request
- [ ] Create/rename/delete a space; the sidebar list updates
- [ ] Create, edit, recolour, retype, drag, bulk-tidy, nest, delete a note
- [ ] Create/move/resize/delete a group
- [ ] List view and calendar view render, including `due_at` grouping
- [ ] Record → upload → transcribe → notes appear, with the status banner moving `recorded → transcribing → extracting → completed`
- [ ] Record from inside a note (fill) and from inside a note (sub-notes)
- [ ] Credits screen: balance + ledger
- [ ] Models screen: list, change chat and transcribe preference, verify it sticks
- [ ] Keys screen: save a key (a bad key is rejected), list shows the hint, delete
- [ ] Plans screen: plans list, `test_pay` subscribe end to end, credits granted once
- [ ] Out-of-credits sheet opens on a 402 (force it by zeroing the balance)
- [ ] Settings: display name, delete account

**Rollback:** one `git revert` of the `container.ts` commit. Supabase is untouched and still authoritative.

---

## Phase 11 — Frontend adapters (mobile)

- [ ] Copy `repositories.ts` and `noteRepository.ts` from web verbatim (they are byte-identical today — keep them so)
- [ ] `tokenStore.ts` on `expo-secure-store` + `AsyncStorage`
- [ ] `auth.ts` with working `startAutoRefresh`/`stopAutoRefresh`
- [ ] `storage.ts` keeping the native `arrayBuffer` / web `Blob` branch verbatim
- [ ] `realtime.ts` — **verify `fetch` streaming on a real device**; fall back to 2 s polling if it does not work (see [06](06-frontend-cutover.md#realtimeport))
- [ ] `container.ts` switch
- [ ] `EXPO_PUBLIC_API_URL` = LAN IP; remove `@supabase/*` and `react-native-url-polyfill`
- [ ] `npm run typecheck && npm test` in `apps/mobile`
- [ ] The same click-through checklist as Phase 10, **on a physical device**

**Acceptance:** the Phase 10 checklist passes on iOS and Android hardware, and the recording status banner advances without polling stalls.
**Rollback:** ship the previous binary, **or** flip the remote feature flag if you took mitigation (1) from [08 §8](08-data-migration-runbook.md#8-rollback). Decide which before this phase starts.

---

## Phase 12 — Decommission

Only after both clients have run on FastAPI in production for a full release
cycle with no rollback.

- [ ] Unset `SUPABASE_JWT_SECRET`; deploy; confirm old tokens now 401
- [ ] Delete `apps/{web,mobile}/src/infrastructure/supabase/`
- [ ] Rename `supabaseContainer` → `container` (mechanical, separate commit)
- [ ] Remove `@supabase/*` from both `package.json`s and re-lock
- [ ] Move `supabase/` to `docs/legacy/supabase/` (do **not** delete — it is the only record of the prompt versions and the migration rationale comments)
- [ ] Delete `app/compat/` once both clients use RESTful paths (separate change)
- [ ] Delete the stopgap Next.js routes — `apps/web/src/app/api/{spaces,notes,groups,relationships,auth}` and `apps/web/src/lib/api/` — **only after** the MCP server has been repointed and exercised against FastAPI ([06 §Next.js API routes](06-frontend-cutover.md#nextjs-api-routes)). Keep `app/api/functions/[name]/route.ts` and the `isApi` exclusion in `proxy.ts`
- [ ] Ship the new `MINDSPACE_API_URL` to anyone running the MCP server before the routes come out, or the agent surface goes dark
- [ ] Pause/delete the Supabase project **only after a final `pg_dump` is archived off-platform**

**Acceptance:** `grep -rn "supabase" apps/ --include=*.ts --include=*.tsx` returns nothing outside comments, and `apps/mcp` still passes its smoke check with only its base URL changed.
**Rollback:** past this point there is none. That is why it is a separate phase gated on a full release cycle.

---

## Strangler-fig option {#strangler-fig-option}

**Prefer this whenever production users exist.** The migration comments in this
repo read like they do — `0017_fix_credit_guard.sql` says *"That made
transcription fail for every user with a platform key"*, which is a production
incident, not a hypothetical.

### How it works

The seam is `apps/*/src/infrastructure/container.ts`, and `Repositories` is
**thirteen independent fields**. Nothing forces them to point at the same
backend.

```ts
export const supabaseContainer: Repositories = {
  // Cut over:
  spaces:    apiSpaceRepository,
  notes:     apiNoteRepository,
  groups:    apiGroupRepository,
  // Still Supabase:
  recordings: supabaseRecordingRepository,
  credits:    supabaseCreditRepository,
  models:     supabaseModelRepository,
  account:    supabaseAccountRepository,
  keys:       supabaseKeyRepository,
  billing:    supabaseBillingRepository,
  auth:       supabaseAuth,
  storage:    supabaseStorage,
  realtime:   supabaseRealtime,
  functions:  supabaseFunctions,
};
```

**What makes it work is the dual-secret JWT check** ([04 §A](04-authorization.md#a-auth-tokens)):
the FastAPI API accepts Supabase-issued tokens, so a session created by
`supabaseAuth` authenticates against both backends. `auth` stays on Supabase
until last.

**What makes it hard is the database.** Both backends must read and write the
*same* Postgres. Two ways:

| Approach | How | When |
|---|---|---|
| **A — FastAPI against the Supabase database** (recommended) | Point `DATABASE_URL` at the Supabase Postgres directly (Supabase exposes a connection string). No data migration during the strangler period at all; the two backends share one database. Cut over repository by repository, then do the data move as a final, fast step with everything already on FastAPI | Default choice. Zero dual-write risk |
| **B — dual write** | Every write goes to both databases | **Avoid.** The credit ledger is append-only and money paths are not idempotent across two stores. Only consider it if the Supabase database is unreachable from your hosting |

With approach A, FastAPI connects as a role that **bypasses RLS** (the
`postgres` role, or a role with `BYPASSRLS`), because its authorization is
Python-side. The Supabase path keeps its RLS. Both are correct simultaneously.

### Recommended cutover order

Lowest risk first; each step is one deploy and one revert.

1. **`spaces`, `groups`, `timeline`** — pure CRUD, no money, no files, low traffic
2. **`notes`** — the highest-traffic CRUD; the one where a bug is most visible, so do it while the blast radius is still small
3. **`credits`, `models`, `account`** — reads plus two narrow writes
4. **`keys`** — needs `BYOK_MASTER_KEY` in place and the crypto test green
5. **`storage`** — needs the MinIO mirror complete, or keep pointing at Supabase Storage a while longer (the `StoragePort` does not care)
6. **`recordings` + `realtime`** — SSE replaces the postgres_changes subscription; validate on device
7. **`functions`** — the AI pipeline. Last, because it is the most expensive to get wrong and it depends on 3, 4 and 6
8. **`billing`** — money, second to last from the top
9. **`auth`** — **last**. Until this flips, sessions come from GoTrue and the compat secret carries them. Once it flips, `SUPABASE_JWT_SECRET` can be unset a release later

### When to prefer the big-bang cutover instead

- No production users, or a handful of internal ones.
- The Supabase database is not reachable from where FastAPI will run (approach A is off the table and approach B is a trap).
- You control both clients' release timing tightly — i.e. web-only, or a forced mobile update.

In that case: Phases 0–9, then the [08 runbook](08-data-migration-runbook.md) in
one window, then Phases 10–11 as a single release.
