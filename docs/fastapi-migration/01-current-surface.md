# 01 — The current surface, exhaustively

Everything the migration has to reproduce. Nothing here is aspirational; each
row was read out of the repo.

---

## 1. Edge functions → FastAPI destinations

Source: `supabase/functions/`. All seven are `Deno.serve` handlers reading a
JSON body, authenticating via `getUserOrThrow(req)`, and returning
`json(body, status)`.

| Edge function | File | Does | FastAPI destination |
|---|---|---|---|
| `transcribe` | `supabase/functions/transcribe/index.ts` | Fetch recording row → resolve transcribe model → resolve key → reserve credits (6/min × multiplier, ceil) → set `recordings.status='transcribing'` → signed URL → provider call → insert `transcripts` → set `status='extracting', error=null` → settle credits → delete audio if free plan | `app/modules/recordings/service.py::TranscriptionService.transcribe()`, exposed at `POST /functions/transcribe` (compat) and `POST /recordings/{id}/transcribe` |
| `ai-extract` | `supabase/functions/ai-extract/index.ts` | Transcript → chat model → key → reserve 8 credits × multiplier → load space notes → build clock from `profiles.timezone` → provider chat (JSON mode) → `parseExtraction` → insert `ai_actions` → generate UUIDs → resolve parents → layout (grid + radial children) → bulk insert `sticky_notes` → insert `ai_action_items` → insert `relationships` → settle | `app/modules/ai/service.py::ExtractionService.extract()`, at `POST /functions/ai-extract` and `POST /ai/extract` |
| `ai-note-write` | `supabase/functions/ai-note-write/index.ts` | Transcript + one note → chat model → key → reserve 4 credits × multiplier → provider chat → `writtenNoteSchema` → append-or-replace `sticky_notes.content`, maybe set `title`/`due_at` → settle | `app/modules/ai/service.py::NoteWriteService.write()`, at `POST /functions/ai-note-write` and `POST /ai/note-write` |
| `byok-save` | `supabase/functions/byok-save/index.ts` | Validate key format (≥8 chars) → live-validate if provider ∈ `{openrouter}` → AES-GCM encrypt → upsert `user_ai_keys` on `(user_id, provider, label)` | `app/modules/byok/service.py::KeyService.save()`, at `POST /functions/byok-save` and `POST /keys` |
| `byok-delete` | `supabase/functions/byok-delete/index.ts` | Delete `user_ai_keys` where `id = keyId AND user_id = caller` | `app/modules/byok/service.py::KeyService.delete()`, at `POST /functions/byok-delete` and `DELETE /keys/{key_id}` |
| `subscribe-start` | `supabase/functions/subscribe-start/index.ts` | `GET` → `listProviders()`. `POST` → load plan; if `price_egp == 0` insert an immediately-`active` subscription with `channel='test_pay'` and `current_period_end = +100 years`; else insert `pending` subscription and call `provider.createCharge()` | `app/modules/billing/service.py::SubscriptionService.start()` / `.list_providers()`, at `POST /functions/subscribe-start`, `GET /functions/subscribe-start`, `POST /billing/subscriptions`, `GET /billing/providers` |
| `subscribe-confirm` | `supabase/functions/subscribe-confirm/index.ts` | Load subscription (403 if not owner, early-return if already `active`) → `provider.verify()` → reject unless `status === 'verified'` → reject on `amountEgp != plan.price_egp` → insert `payments` (unique `(channel, external_ref)` = idempotency) → `grant_credits` if `total_credits > 0` → set subscription `active` + period | `app/modules/billing/service.py::SubscriptionService.confirm()`, at `POST /functions/subscribe-confirm` and `POST /billing/subscriptions/{id}/confirm` |

### `_shared/` modules → Python destinations

| Shared module | Contents | Python destination |
|---|---|---|
| `_shared/auth.ts` | `HttpError(status, code, message)`, `json()`, `getUserOrThrow(req)` | `app/core/errors.py::AppError` + `app/core/exception_handlers.py`; `app/modules/auth/deps.py::current_user` |
| `_shared/supabase.ts` | `adminClient()` (service role, bypasses RLS), `userClient(req)` (JWT-bound, RLS applies) | **Disappears.** One `AsyncSession` per request from `app/core/db.py::get_session`. The admin/user split is replaced by explicit ownership checks — see [04](04-authorization.md) |
| `_shared/crypto.ts` | AES-GCM, 12-byte IV prepended to ciphertext, base64 32-byte `BYOK_MASTER_KEY`; `encryptApiKey`, `decryptApiKey`, `keyHint` (last 4 chars, `…abcd`) | `app/modules/byok/crypto.py` using `cryptography.hazmat.primitives.ciphers.aead.AESGCM`. **Wire-format compatible — no re-encryption needed.** |
| `_shared/credits.ts` | Thin wrappers over the three credit RPCs; maps `INSUFFICIENT_CREDITS` → HTTP 402 `insufficient_credits` | `app/modules/credits/service.py::CreditService.{reserve,settle,release}` |
| `_shared/keys.ts` | `PROVIDER_BASE_URL` map (openrouter/openai/google/nvidia/anthropic), `resolveApiKey(admin, userId, provider, byokOnly)` → user key → platform key (`PLATFORM_{PROVIDER}_KEY`) → `byok_required` / `no_platform_key` / `unsupported_provider` | `app/modules/byok/resolver.py::resolve_api_key()` |
| `_shared/models.ts` | `resolveModel(db, kind, userId)`: profile preference → (chat only) a model on a provider the user holds a key for → `is_default` row | `app/modules/ai/models.py::resolve_model()` |
| `_shared/layout.ts` | `slotRect`, `layoutNewNotes` (4-column grid, 190×145, gap 22, overlap scan capped at 4000), `radialChildRect` (150×110, distance 210, 60° steps), `placeChild` | `app/modules/ai/layout.py` — **port line for line**; `apps/*/src/features/ai/services/layout.ts` carries the unit tests that define correctness |
| `_shared/extraction.ts` | `NOTE_TYPES`, `REL_TYPES`, `NOTE_COLORS` (7 hex values), `colorForNote`, `MAX_NOTES = 8`, `extractJsonBlock` (balanced-brace scanner), `parseExtraction` (dedupe clientKeys, drop ambiguous parents/relations), `resolveParentId` (parent must appear earlier in batch) | `app/modules/ai/extraction.py` with Pydantic v2 models mirroring the Zod schemas |
| `_shared/prompts/extractThoughts.ts` | `EXTRACT_THOUGHTS_VERSION = 'extract_thoughts@8'`, `EXTRACT_THOUGHTS_SYSTEM`, `ExistingNoteContext`, `PromptClock`, `buildExtractUserPrompt(transcript, existingNotes, focusNote, clock)` | `app/modules/ai/prompts/extract_thoughts.py` — copy the prompt strings **verbatim**, they are pure functions with no DB/env coupling |
| `_shared/prompts/writeNote.ts` | `WRITE_NOTE_VERSION = 'write_note@1'`, `WRITE_NOTE_SYSTEM`, `buildWriteNotePrompt(transcript, note, clock)` | `app/modules/ai/prompts/write_note.py` |
| `_shared/providers/openaiCompatible.ts` | `createOpenAICompatibleProvider(baseUrl)` → `.chat()`, `.transcribe()` (multipart `/audio/transcriptions`), `.transcribeViaChat()` (base64 `input_audio` part); 60 s timeout → HTTP 504 `provider_timeout`; non-2xx → 502 `provider_error` | `app/modules/ai/providers/openai_compatible.py` using `httpx.AsyncClient(timeout=60.0)` |
| `_shared/providers/openrouter.ts` | One line: the factory bound to `https://openrouter.ai/api/v1` | `app/modules/ai/providers/__init__.py::openrouter` |
| `_shared/payments/types.ts` | `PAYMENT_CHANNELS`, `ChargeInput`, `ChargeIntent`, `VerifyInput`, `VerificationResult` (discriminated union: only `status='verified'` counts), `PaymentProvider`, `ProviderNotConfiguredError` | `app/modules/billing/payments/base.py` — `VerificationResult` as a Pydantic discriminated union on `status`; keep the "exactly one literal means paid" property |
| `_shared/payments/factory.ts` | `REGISTRY` dict, `paymentProviderFor(channel)` (400 `unknown_payment_channel`), `listProviders()` | `app/modules/billing/payments/registry.py` |
| `_shared/payments/testPay.ts` | Enabled only when `ALLOW_TEST_PAY == 'true'`; `confirmToken == f"testpay_{reference}"` | `app/modules/billing/payments/test_pay.py` |
| `_shared/payments/googlePay.ts` | Scaffold. Requires `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE_NAME`. Both methods raise | `app/modules/billing/payments/google_pay.py` — keep raising |
| `_shared/payments/applePay.ts` | Scaffold. Requires `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_BUNDLE_ID` | `app/modules/billing/payments/apple_pay.py` |
| `_shared/payments/instapay.ts` | Scaffold. Requires `INSTAPAY_GATEWAY_API_KEY`, `INSTAPAY_MERCHANT_ID`. The file's warning ("do NOT trust a pasted transfer reference") must survive into the Python docstring | `app/modules/billing/payments/instapay.py` |

### Function config (`supabase/config.toml`)

`[functions.transcribe] verify_jwt = true` and `[functions.ai-extract] verify_jwt = true`.
The other five verify inside the handler via `getUserOrThrow`. In FastAPI **all
seven require auth uniformly** via `Depends(current_user)`.

---

## 2. Migration inventory

`supabase/migrations/` — 28 files, 1154 lines. Note two **duplicated numeric
prefixes**; linearize in this order:

```
0001 0002 0003 0004 0005 0006 0007 0008
0009_recording_status_extracting  ← apply before 0009_timeline (it only ALTERs a type)
0009_timeline
0010 0011 0012 0013 0014 0015 0016 0017 0018 0019 0020 0021
0022_default_space   ← replaces handle_new_user()
0022_note_groups
0023 0024 0025 0026 0027 0028
```

Alembic gets **one squashed baseline** (`0001_baseline.py`) representing the end
state, not a replay. In particular create `recording_status` with all seven
labels at once rather than `ALTER TYPE ADD VALUE`.

### 2.1 Extensions (`0001_extensions.sql`)

`pgcrypto`, `pg_cron`, `pg_net`, `vector`.

| Extension | Used for | After |
|---|---|---|
| `pgcrypto` | `gen_random_uuid()` defaults | Keep (`CREATE EXTENSION IF NOT EXISTS pgcrypto`) — or generate UUIDs in Python; the baseline keeps the DB default |
| `pg_cron` | `0012_cron.sql` | **Drop.** Replaced by APScheduler |
| `pg_net` | Never referenced anywhere in the repo | **Drop** |
| `vector` | Never referenced (no `vector` column exists) | **Drop.** Re-add if semantic search lands |

### 2.2 Enums (`0002_enums.sql`, `0009_recording_status_extracting.sql`, `0024_subscriptions.sql`)

| Postgres type | Values | Python |
|---|---|---|
| `note_type` | `idea, task, question, decision, reference, thought, summary` | `app/modules/notes/enums.py::NoteType(str, Enum)` |
| `rel_type` | `related, depends_on, supports, contradicts, derived_from, child_of` | `app/modules/notes/enums.py::RelType` |
| `source_type` | `voice, manual, ai` | `app/modules/notes/enums.py::SourceType` |
| `recording_status` | `recorded, uploading, transcribing, transcribed, failed` **+ `extracting`, `completed`** (added by `0009_recording_status_extracting.sql`) | `app/modules/recordings/enums.py::RecordingStatus` — 7 values, matching `core/domain/index.ts::RecordingStatus` |
| `ai_action_kind` | `extract_thoughts, detect_relations, thought_evolution, weekly_digest` | `app/modules/ai/enums.py::AiActionKind` |
| `ai_action_status` | `pending, proposed, accepted, partially_accepted, rejected, undone, failed` | `app/modules/ai/enums.py::AiActionStatus` — see [11](11-risks-open-questions.md) about `ai-note-write` writing a non-existent `'applied'` |
| `provider_id` | `openrouter, openai, google, anthropic, nvidia, custom` | `app/modules/ai/enums.py::ProviderId` |
| `model_kind` | `chat, transcribe` | `app/modules/ai/enums.py::ModelKind` |
| `ledger_reason` | `signup_grant, monthly_refill, purchase, usage, refund, reversal, admin_adjust` | `app/modules/credits/enums.py::LedgerReason` |
| `payment_channel` | `google_pay, apple_pay, instapay, test_pay` | `app/modules/billing/enums.py::PaymentChannel` |
| `subscription_status` | `pending, active, cancelled, expired` | `app/modules/billing/enums.py::SubscriptionStatus` |

Use `sqlalchemy.Enum(PyEnum, name="note_type", native_enum=True, create_type=...)`
so the DB types keep their names — the data migration copies raw values.

### 2.3 Tables

| Table | Migration | Owning module |
|---|---|---|
| `profiles` | `0003_profiles.sql` (+ FKs in `0004`) | `auth` (identity half) + `credits` (balance half) — see [03](03-data-model.md) |
| `ai_models` | `0004_ai_models.sql`, `0019`, `0025`, `0027` | `ai` |
| `user_ai_keys` | `0005_user_ai_keys.sql` | `byok` |
| `credit_packages` | `0006_credits.sql` | `credits` |
| `credit_ledger` | `0006_credits.sql` | `credits` |
| `credit_reservations` | `0006_credits.sql` | `credits` |
| `payments` | `0006_credits.sql` (+ `subscription_id` in `0024`) | `billing` |
| `spaces` | `0007_core.sql` | `spaces` |
| `recordings` | `0007_core.sql` | `recordings` |
| `transcripts` | `0007_core.sql` | `recordings` |
| `sticky_notes` | `0007_core.sql` (+ `due_at` in `0023`) | `notes` |
| `relationships` | `0007_core.sql` | `notes` |
| `ai_actions` | `0008_ai_actions.sql` | `ai` |
| `ai_action_items` | `0008_ai_actions.sql` | `ai` |
| `timeline_events` | `0009_timeline.sql` | `timeline` |
| `note_groups` | `0022_note_groups.sql` | `notes` |
| `subscription_plans` | `0024_subscriptions.sql` (+ `0025`, `0026`, `0027`, `0028`) | `billing` |
| `subscriptions` | `0024_subscriptions.sql` | `billing` |
| **new** `users` | — | `auth` — replaces `auth.users`; see [03](03-data-model.md#auth-users) |

Full column lists are in [03-data-model.md](03-data-model.md).

### 2.4 Indexes

Reproduce every one of these in the Alembic baseline. Names in parentheses are
what Postgres auto-generated; give them explicit names in the baseline.

| Index | Table | Definition |
|---|---|---|
| `ix_credit_ledger_user_created` | `credit_ledger` | `(user_id, created_at desc)` |
| `ix_credit_reservations_status_expires` | `credit_reservations` | `(status, expires_at)` |
| `ix_spaces_user_activity` | `spaces` | `(user_id, last_activity_at desc) WHERE deleted_at IS NULL` |
| `ix_recordings_space_created` | `recordings` | `(space_id, created_at desc)` |
| `ix_transcripts_recording` | `transcripts` | `(recording_id)` |
| `ix_sticky_notes_space_live` | `sticky_notes` | `(space_id) WHERE deleted_at IS NULL` |
| `ix_sticky_notes_space_xy` | `sticky_notes` | `(space_id, x, y)` |
| `ix_sticky_notes_parent` | `sticky_notes` | `(parent_id)` |
| `ix_sticky_notes_recording` | `sticky_notes` | `(recording_id)` |
| `ix_sticky_notes_space_due` | `sticky_notes` | `(space_id, due_at) WHERE deleted_at IS NULL` (from `0023`) |
| `rel_unique` | `relationships` | UNIQUE `(from_note_id, to_note_id, type) WHERE deleted_at IS NULL` |
| `ix_ai_actions_space_created` | `ai_actions` | `(space_id, created_at desc)` |
| `ix_ai_actions_user_created` | `ai_actions` | `(user_id, created_at desc)` |
| `ix_ai_action_items_action_sort` | `ai_action_items` | `(ai_action_id, sort_order)` |
| `ix_timeline_events_space_created` | `timeline_events` | `(space_id, created_at desc)` |
| `ix_note_groups_space_live` | `note_groups` | `(space_id) WHERE deleted_at IS NULL` |
| `ix_subscriptions_user_status` | `subscriptions` | `(user_id, status)` |

Unique constraints: `ai_models (provider, model_id, kind)` (widened by `0019`
from `(provider, model_id)`), `user_ai_keys (user_id, provider, label)`,
`payments (channel, external_ref)` — **this one is the payment idempotency
guarantee, do not lose it**.

Check constraints: `profiles.credits_balance >= 0`, `profiles.credits_reserved >= 0`,
`credit_reservations.amount > 0`, `relationships.from_note_id <> to_note_id`
(`no_self_link`).

Generated columns: `credit_packages.total_credits` and
`subscription_plans.total_credits`, both
`GENERATED ALWAYS AS (base_credits + (base_credits * bonus_pct / 100)) STORED`.
Keep them as generated columns; map with
`Column(..., Computed("base_credits + (base_credits * bonus_pct / 100)", persisted=True))`.

### 2.5 Triggers → Python

Triggers are a category the task list does not name, and each needs its own
decision. **None of them survive as triggers except `touch_updated_at`, which
becomes an ORM concern.**

| Trigger | Function | Fires on | Destination |
|---|---|---|---|
| `on_auth_user_created` | `handle_new_user()` (`0003`, redefined by `0022_default_space`) — insert `profiles` with 100 credits + `free_refill_at = current_date`, insert `credit_ledger` `signup_grant` +100, insert default space `('My MindSpace','lightbulb')` | `AFTER INSERT ON auth.users` | `app/modules/auth/service.py::AuthService.register()` — one transaction doing all four inserts. Note the seeded emoji is the literal string `'lightbulb'`, not an emoji character; preserve it |
| `t_note_timeline` | `on_note_change()` (`0009_timeline`) — INSERT: `note_created` + `note_count+1` + `last_activity_at=now()`. UPDATE where `deleted_at` newly set: `note_deleted` + `note_count-1` (floored at 0). UPDATE where `content` or `type` changed: `note_updated`. Position-only update: **returns early, no event**. Summary = `coalesce(title, left(content,60))` | `AFTER INSERT OR UPDATE ON sticky_notes` | `app/modules/timeline/service.py::record_note_event()` called from `app/modules/notes/service.py`. **Leak to watch:** `ai-extract` bulk-inserts notes and currently fires this per row — the FastAPI extraction path must emit timeline events and bump `note_count`/`last_activity_at` too, or the timeline silently loses every voice-created note |
| `t_notes_touch`, `t_spaces_touch` | `touch_updated_at()` | `BEFORE UPDATE` | SQLAlchemy `Column("updated_at", DateTime(timezone=True), server_default=func.now(), onupdate=func.now())` |
| `t_guard_profile` | `guard_profile_update()` (`0010`, fixed in `0017` to gate on `current_user IN ('authenticated','anon')`) — raises if `credits_balance` or `credits_reserved` changed | `BEFORE UPDATE ON profiles` | **Application invariant**, not a trigger: no client-facing request schema may contain `credits_balance` or `credits_reserved`. Only `CreditService` writes them. See [04](04-authorization.md#guard-1) |
| `t_promote_children_on_soft_delete` | `promote_children_on_soft_delete()` (`0021`) — when `deleted_at` goes null→not-null, `UPDATE sticky_notes SET parent_id = NULL WHERE parent_id = new.id` | `AFTER UPDATE ON sticky_notes` | `app/modules/notes/service.py::_soft_delete_note()`. **It has two call sites today** (the client's soft delete and `undo_ai_action`'s soft delete) — that is precisely why it was a trigger. Mandate a single `_soft_delete_note()` helper both paths route through, or the promotion regresses on one of them |

### 2.6 Cron (`0012_cron.sql`) → APScheduler

| pg_cron job | Schedule | Body | Destination |
|---|---|---|---|
| `mindspace-free-refill` | `0 2 1 * *` | `select monthly_free_refill();` | `app/modules/credits/jobs.py::monthly_free_refill()` on `CronTrigger(day=1, hour=2, minute=0)` |
| `mindspace-release-stale-reservations` | `5 * * * *` | Two statements: release `held` reservations past `expires_at`, then **recompute** `profiles.credits_reserved` for *every* profile as `coalesce(sum(amount) where status='held', 0)` | `app/modules/credits/jobs.py::sweep_stale_reservations()` on `CronTrigger(minute=5)` |

The second job's recompute is a full-table `UPDATE profiles` with a correlated
subquery — it is a self-healing reconciliation pass, not just a sweep. Keep it
exactly as written; it is what repairs drift after any crash between
`reserve_credits` and `settle_credits`.

Scheduler placement: start APScheduler from the FastAPI `lifespan` handler,
guarded by `settings.run_scheduler` (env `RUN_SCHEDULER=true`) so only one
replica runs it. Take a Postgres advisory lock (`pg_try_advisory_lock(918273)`)
inside each job as a belt-and-braces guard against double execution.

### 2.7 Storage (`0013_storage.sql`) → MinIO

Bucket `recordings`, `public = false`, `file_size_limit = 26214400` (25 MiB),
`allowed_mime_types = ['audio/m4a','audio/mp4','audio/mpeg','audio/wav']`.

Three `storage.objects` policies, all path-scoped on
`(storage.foldername(name))[1] = auth.uid()::text`:
`Users can upload own recordings` (INSERT), `Users can read own recordings`
(SELECT), `Users can delete own recordings` (DELETE).

Key layout comes from `apps/*/src/features/voice/services/audioFormat.ts::buildStoragePath`:

```
{userId}/{spaceId}/{recordingId}.{ext}     ext ∈ m4a | webm | wav | mp3 | aac | ogg
```

**The extension is load-bearing** — `transcribe/index.ts` does
`recording.storage_path.split('.').pop()` to tell the model which container to
decode.

Replacement: MinIO, bucket `recordings`, same key layout, `app/modules/storage/`
wrapping `aioboto3`. The path policies become one line in
`StorageService.assert_owns(key, user_id)`: `key.split("/")[0] == str(user_id)`.
Size and MIME limits move to the presign endpoint's request validation.

Upload flow changes from "client uploads straight to Supabase Storage" to
"client asks the API for a presigned PUT URL, uploads to MinIO, then tells the
API". See [05](05-api-contract.md#recordings) and
[06](06-frontend-cutover.md#storageport).

### 2.8 Realtime (`0018_realtime_recordings.sql`) → SSE

```sql
alter publication supabase_realtime add table recordings;
alter table recordings replica identity full;
```

Consumed by exactly one thing: `RealtimePort.watchRecording(recordingId, cb)` in
`apps/*/src/infrastructure/supabase/platform.ts`, driving
`useRecordingStatus` (`recorded → transcribing → extracting → completed` banner).
It reads only `status` and `error` off the payload.

Because the entire realtime surface is *one row's status*, **SSE beats
WebSocket**: one-way, HTTP-native, and it passes through the Next.js proxy
unchanged.

```
GET /recordings/{recording_id}/events   →  text/event-stream
data: {"status":"transcribing","error":null}
```

**Multi-worker caveat, decide now:** an in-process `asyncio.Queue` fan-out
breaks with more than one uvicorn worker. **This plan pins `--workers 1` in
compose** and uses an in-process broker (`app/modules/recordings/events.py`).
When you need more workers, switch the broker to Postgres `LISTEN/NOTIFY` on
channel `recording_status` — the `RealtimePort` shape does not change either way.

### 2.9 RPCs — stays SQL or becomes Python?

**Discriminator:** anything whose correctness rests on `SELECT … FOR UPDATE`
inside one transaction stays *transaction-shaped* — but as SQLAlchemy-issued SQL
inside `async with session.begin()`, **not** a stored procedure. Everything else
becomes ordinary Python.

| RPC | Migration | Verdict | Destination / notes |
|---|---|---|---|
| `reserve_credits(p_amount int, p_reason text)` → `uuid` | `0011` | **Transaction-shaped Python.** No stored proc | `CreditService.reserve()`. Keeps `SELECT credits_balance - credits_reserved … FOR UPDATE`, raises `InsufficientCredits` → HTTP 402 `insufficient_credits` with message `need N, available M` (the client matches on the code, not the prose) |
| `settle_credits(p_reservation uuid, p_actual int, p_ai_action uuid)` → `int` | `0011` | **Transaction-shaped Python** | `CreditService.settle()`. `FOR UPDATE` on the reservation; only inserts a ledger row when `p_actual > 0` — preserve that, or empty extractions render a "0 credits" row |
| `release_credits(p_reservation uuid)` → `void` | `0011` | **Transaction-shaped Python** | `CreditService.release()`. Silent no-op when the reservation is missing or not `held` |
| `grant_credits(p_user, p_amount, p_reason, p_package, p_payment_ref)` → `int` | `0011` | **Plain Python** | `CreditService.grant()`. Its security *was* the `revoke execute … from authenticated, anon`; that becomes "only `billing` calls it, and there is no HTTP route that reaches it" — enforced by the module dependency rule in [02](02-target-architecture.md) |
| `monthly_free_refill()` → `void` | `0011` | **Plain Python + APScheduler** | `credits/jobs.py`. Semantics: for profiles with `free_refill_at IS NULL OR < date_trunc('month', current_date)` **and** `credits_balance < 100`, set balance to `greatest(balance, 100)`, stamp `free_refill_at = current_date`, and append a ledger row with `delta = 0`, `reason = 'monthly_refill'` |
| `bulk_move_notes(p_moves jsonb)` → `void` | `0014` | **Plain Python — and simplify** | `NoteService.move_many()`. The PL/pgSQL loops row by row; in Python it collapses to a single `UPDATE sticky_notes SET x=v.x, y=v.y FROM (VALUES …) v(id,x,y) WHERE sticky_notes.id = v.id AND user_id = :uid AND deleted_at IS NULL`. Strictly better, same contract |
| `apply_ai_action(p_action_id, p_accepted_item_ids[])` → `void` | `0015` | **Plain Python — but it is dead code today** | Grep proves no client or edge function calls it (`grep -rn "apply_ai_action" apps/ supabase/` → migration only). `ai-extract` inserts notes directly and marks the action `proposed`; nothing ever accepts it. **Port it as `AiActionService.apply()` behind `POST /ai/actions/{id}/apply` for parity, or drop it and record the decision.** Recommendation: port it — it is 60 lines and the `ai_action_items` rows are already being written |
| `undo_ai_action(p_action_id)` → `void` | `0015` | **Plain Python — also dead code today** | `AiActionService.undo()` behind `POST /ai/actions/{id}/undo`. Must route its soft-deletes through `_soft_delete_note()` so child promotion still happens (see 2.5) |
| `delete_own_account()` → `void` | `0020` | **Plain Python** | `AccountService.delete_account()`. Note: the migration's comment claims "`spaces.user_id` / `user_ai_keys.user_id` carry no FK" — **this is factually wrong**, `0007_core.sql` and `0005_user_ai_keys.sql` both declare `references auth.users on delete cascade`. With an owned `users` table the cascade does the work; keep the explicit deletes as belt-and-braces. Ledger/payment/reservation history is deliberately **retained** after account deletion (they have `on delete cascade` on `user_id` → so they are *not* retained today; see [11](11-risks-open-questions.md#q4)) |
| `guard_profile_update()` | `0010`/`0017` | **Application invariant** | See 2.5 and [04](04-authorization.md#guard-1) |
| `handle_new_user()` | `0003`/`0022_default_space` | **Plain Python** | `AuthService.register()` — see 2.5 |
| `on_note_change()` | `0009_timeline` | **Plain Python** | `TimelineService` — see 2.5 |
| `promote_children_on_soft_delete()` | `0021` | **Plain Python** | `NoteService._soft_delete_note()` — see 2.5 |
| `touch_updated_at()` | `0009_timeline` | **ORM** | `onupdate=func.now()` |

### 2.10 Seed data (`supabase/seed.sql` + inline inserts in migrations)

Everything below must be reproduced by `services/api/seeds/seed.py`, run by the
`seed` compose service.

| Rows | Source |
|---|---|
| 4 `credit_packages`: `starter_50`, `regular_100`, `pro_250`, `max_500` | `0006_credits.sql` |
| 5 `ai_models` chat on `openrouter` (`deepseek/deepseek-v4-flash` **is_default**, `qwen/qwen3.7-flash`, `google/gemini-3.1-flash-lite-preview`, `moonshotai/kimi-k2.5`, `z-ai/glm-5`) | `seed.sql` |
| 5 `ai_models` transcribe on `openrouter` (`google/gemini-2.5-flash` **is_default**, `google/gemini-2.5-flash-lite`, `google/gemini-3.1-flash-lite-preview`, `google/gemini-3-flash-preview`, `google/gemini-2.5-pro`) | `seed.sql` |
| 7 BYOK-only chat models (3 anthropic, 2 openai, 2 google) | `0025` |
| 3 BYOK-only transcribe models — **all disabled by `0027`** | `0025` + `0027` |
| Also disabled by `0027`: any `byok_only` chat model whose provider ∉ `{openai, anthropic, google}` | `0027` |
| 6 `subscription_plans`: `free` (0 EGP, `ai_enabled=false`, 5 min), `hobby` (50, 500+25%, 15 min), `plus` (150, 1500+35%, 30 min, featured), `pro` (300, 3000+50%, 60 min), `max` (500, 5000+60%, 120 min), `byok` (50 EGP, 900 credits, `is_byok=true`, 120 min) | `0024`+`0025`+`0026`+`0027`+`0028` |

Seed the **end state** directly. Do not replay `0025 → 0026 → 0027` deltas.

---

## 3. How the frontends call the backend today

### 3.1 The seam already exists

`apps/web/src/core/ports/index.ts` and `apps/mobile/src/core/ports/index.ts`
define 13 contracts, and `core/ports/container.ts` bundles them into
`Repositories`. The file's own docstring states the goal: *"No signature here
mentions Supabase."* `core/architecture.test.ts` enforces it — it fails the
build if anything outside `src/infrastructure/` imports
`@supabase/supabase-js` or `lib/supabase/client`.

| Port | Methods | Adapter today |
|---|---|---|
| `NoteRepository` | `listBySpace, findById, create, updateContent, updateColor, updateType, updatePosition, moveMany, remove, updateParent` | `infrastructure/supabase/noteRepository.ts` |
| `SpaceRepository` | `list, create, rename, remove` | `infrastructure/supabase/repositories.ts` |
| `GroupRepository` | `listBySpace, create, update, remove` | ″ |
| `RecordingRepository` | `listBySpace, create, markFailed, markCompleted, findTranscriptId, getStatus` | ″ |
| `CreditRepository` | `getBalance, listLedger` | ″ |
| `ModelRepository` | `list, getPreferences, setPreference` | ″ |
| `AccountRepository` | `getProfile, updateDisplayName, deleteAccount` | ″ |
| `KeyRepository` | `list, save, remove` | ″ (save/remove go through edge functions) |
| `BillingRepository` | `listPlans, getActiveSubscription, listPaymentProviders, start, confirm` | ″ |
| `AuthPort` | `getSession, onSessionChange, signIn, signUp, signOut, resetPassword, startAutoRefresh, stopAutoRefresh` | `infrastructure/supabase/platform.ts` |
| `StoragePort` | `uploadRecording, signedUrl` | ″ |
| `RealtimePort` | `watchRecording` | ″ |
| `FunctionsPort` | `invoke<T>(name, body)` | `infrastructure/supabase/functions.ts` |

### 3.2 What is identical between web and mobile

Verified by `diff`:

- `infrastructure/supabase/repositories.ts` — **byte-identical**
- `infrastructure/supabase/noteRepository.ts` — **byte-identical**
- `infrastructure/supabase/mappers.ts` — differs by 3 lines (`aiEnabled: row.ai_enabled ?? true` on mobile only)
- `client.ts`, `functions.ts`, `platform.ts` — genuinely platform-specific

Consequence: **write the new adapters once, copy to both apps.** See
[06-frontend-cutover.md](06-frontend-cutover.md).

### 3.3 Web-only Supabase coupling

| File | What it does |
|---|---|
| `apps/web/src/proxy.ts` | Next proxy: `createServerClient` + `supabase.auth.getUser()` to refresh the cookie session and redirect signed-out visitors to `/sign-in`. Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, images |
| `apps/web/src/app/api/functions/[name]/route.ts` | POST/GET passthrough to `${SUPABASE_URL}/functions/v1/${name}`, forwarding `Authorization` and adding `apikey`. Exists to dodge browser CORS preflight |
| `apps/web/src/infrastructure/supabase/server.ts` | `createSupabaseServerClient()` for Server Components / Route Handlers, async `cookies()` (Next 16) |

### 3.4 Paths named in the task that **do not exist**

`apps/mobile/src/lib/supabase` and `apps/web/src/lib/supabase` **do not exist**.
Both apps only have `src/lib/query-client/{index.ts,keys.ts}` (TanStack Query
setup — no Supabase import). The Supabase-specific code lives entirely under
`src/infrastructure/supabase/`. Do not go hunting.

### 3.5 The pipeline the whole app hangs off

`apps/*/src/features/voice/services/pipeline.ts::runThinkingPipeline(recordingId, spaceId, parentNoteId?, fillNoteId?)`:

1. `recordings.findTranscriptId(recordingId)` — never transcribe twice
2. if none: `functions.invoke('transcribe', { recordingId })`
3. then either `functions.invoke('ai-note-write', { transcriptId, noteId: fillNoteId })`
   or `functions.invoke('ai-extract', { transcriptId, spaceId, parentNoteId })`
4. `recordings.markCompleted(recordingId)`

This file **does not change**. Only what `functions.invoke` points at changes.
