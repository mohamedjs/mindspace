# 05 — API contract, endpoint by endpoint

Derived mechanically from `apps/*/src/infrastructure/supabase/repositories.ts`,
`noteRepository.ts`, `platform.ts`, `functions.ts` and the seven edge functions.
Nothing here is invented; if a method exists in a port, it has a row.

**Base path:** none. Routes are mounted at the root of the API app.
`API_BASE_URL` in the clients is e.g. `http://localhost:8000`.

**Casing:** request and response bodies are **snake_case**, matching the
Postgres column names the frontend `mappers.ts` already consumes
(`NOTE_COLUMNS`, `SPACE_COLUMNS`, `GROUP_COLUMNS`). Do not camelCase the CRUD
payloads.

**Exception — the seven `/functions/*` bodies keep their current camelCase**
(`recordingId`, `transcriptId`, `spaceId`, `parentNoteId`, `noteId`, `keyId`,
`planId`, `subscriptionId`, `apiKey`, `baseUrl`, `aiActionId`, `noteIds`,
`creditsCharged`, `keyHint`) because both clients already send and parse
exactly those keys. Pydantic aliases:
`model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)` on
those schemas only.

---

## Error envelope {#error-envelope}

**Mandatory and load-bearing.** Both clients' `functions.ts` do:

```ts
throw new PipelineError(data.error, data.message ?? data.reason ?? data.error, res.status, data);
```

and the UI switches on the *code*. FastAPI's default `{"detail": …}` would
collapse the entire error taxonomy into one generic apology and nothing would
fail loudly.

Every non-2xx response body is exactly:

```json
{ "error": "<machine_code>", "message": "<human text>" }
```

plus, for some, extra keys the clients read (`reason`, `channel`, `missing`).

```python
# app/core/exception_handlers.py
@app.exception_handler(AppError)
async def app_error_handler(request, exc: AppError):
    return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message, **exc.extra})

@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    return JSONResponse(status_code=422, content={"error": "validation_error", "message": str(exc)})

@app.exception_handler(StarletteHTTPException)
async def http_handler(request, exc):
    return JSONResponse(status_code=exc.status_code, content={"error": _code_for(exc.status_code), "message": str(exc.detail)})
```

### Complete error-code table (all read out of the current code)

| Code | Status | Raised by | Client behaviour today |
|---|---|---|---|
| `unauthorized` | 401 | `getUserOrThrow` | Sign-out / redirect |
| `forbidden` | 403 | ownership checks in `transcribe`, `ai-extract`, `ai-note-write`, `subscribe-confirm` | Generic error |
| `missing_recording_id` | 400 | `transcribe` | |
| `recording_not_found` | 404 | `transcribe` | |
| `recording_not_uploaded` | 400 | `transcribe` | |
| `signed_url_failed` | 500 | `transcribe` | |
| `audio_fetch_failed` | 500 | `transcribe` | |
| `transcript_insert_failed` | 500 | `transcribe` | |
| `missing_params` | 400 | `ai-extract`, `ai-note-write`, `byok-save`, `subscribe-start`, `subscribe-confirm` | |
| `transcript_not_found` | 404 | `ai-extract`, `ai-note-write` | |
| `parent_note_not_found` | 404 | `ai-extract` | |
| `note_not_found` | 404 | `ai-note-write` | |
| `action_insert_failed` | 500 | `ai-extract` | |
| `notes_insert_failed` | 500 | `ai-extract` | |
| `note_update_failed` | 500 | `ai-note-write` | |
| `insufficient_credits` | **402** | `_shared/credits.ts` when the RPC message contains `INSUFFICIENT_CREDITS` | **Opens the top-up sheet** (`OutOfCreditsSheet`) |
| `reserve_failed` | 500 | `_shared/credits.ts` | |
| `settle_failed` | 500 | `_shared/credits.ts` | |
| `byok_required` | 400 | `resolveApiKey` on a `byok_only` model with no user key | "add your key" |
| `no_platform_key` | 500 | `resolveApiKey` when `PLATFORM_*_KEY` is unset | |
| `unsupported_provider` | 500 | `resolveApiKey` | |
| `no_model_available` | 500 | `resolveModel` | |
| `provider_timeout` | **504** | `openaiCompatible.postJson` after 60 s | "the AI took too long", retry |
| `provider_error` | **502** | any non-2xx from the model provider | Retry |
| `invalid_key_format` | 400 | `byok-save` (<8 chars) | |
| `key_validation_failed` | 400 | `byok-save` live-validation | "This key was rejected by the provider." |
| `save_failed` | 500 | `byok-save` | |
| `missing_key_id` | 400 | `byok-delete` | |
| `delete_failed` | 500 | `byok-delete` | |
| `plan_not_found` | 404 | `subscribe-start`, `subscribe-confirm` | |
| `plan_disabled` | 400 | `subscribe-start` | |
| `subscription_create_failed` | 500 | `subscribe-start` | |
| `subscription_not_found` | 404 | `subscribe-confirm` | |
| `unknown_payment_channel` | 400 | `paymentProviderFor` | |
| `provider_not_configured` | **501** | `ProviderNotConfiguredError`; body also carries `channel` and `missing[]` | "not available yet" |
| `payment_not_verified` | **402** | `subscribe-confirm`; body also carries `reason` | |
| `amount_mismatch` | **402** | `subscribe-confirm` | |
| `payment_record_failed` | 500 | `subscribe-confirm` | |
| `grant_failed` | 500 | `subscribe-confirm` | |
| `internal_error` | 500 | every function's catch-all | Generic |
| `not_signed_in` | — | thrown client-side by `requireUserId()` | *(stays client-side)* |
| `validation_error` | 422 | **new** — FastAPI request validation | Generic. Acceptable: no current path produces a 422 |

New codes this migration introduces (auth was GoTrue's before):
`invalid_credentials` (401), `email_taken` (409), `weak_password` (400),
`invalid_token` (401), `token_expired` (401), `email_not_confirmed` (403).

---

## 1. Auth — `app/modules/auth/router.py` {#auth}

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| POST | `/auth/sign-up` | `{email, password, full_name?}` | `TokenPair` (see [04](04-authorization.md#a-auth-tokens)) or `{user, session: null}` when confirmation required | — | `supabase.auth.signUp` (`platform.ts`) |
| POST | `/auth/sign-in` | `{email, password}` | `TokenPair` | — | `supabase.auth.signInWithPassword` |
| POST | `/auth/refresh` | `{refresh_token}` | `TokenPair` (rotated) | — | Supabase auto-refresh |
| POST | `/auth/sign-out` | `{refresh_token?}` | `204` | Bearer | `supabase.auth.signOut` |
| POST | `/auth/reset-password` | `{email}` | `202 {"ok": true}` always | — | `supabase.auth.resetPasswordForEmail` |
| POST | `/auth/reset-password/confirm` | `{token, password}` | `204` | — | Supabase recovery deep link |
| GET | `/auth/session` | — | `{user: {id, email, user_metadata}}` | Bearer | `supabase.auth.getSession` / `getUser` |

Behavioural notes:

- `sign-up` with confirmation ON returns **no session** — `0016_email_auth_notes.sql`
  documents that the app's sign-up screen already handles a null session by
  prompting the user to check their inbox. Preserve that shape:
  `{"user": {...}, "session": null}`.
- `reset-password` returns 202 whether or not the email exists.
- `sign-up` runs the whole of `handle_new_user()` in one transaction: insert
  `users`, insert `profiles` (100 credits, `free_refill_at = current_date`,
  `is_anonymous` from the request — always `false`), insert `credit_ledger`
  (`+100`, `balance_after=100`, `signup_grant`), insert `spaces`
  (`'My MindSpace'`, emoji `'lightbulb'`).

## 2. Account — `AccountRepository`

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| GET | `/account/profile` | — | `{display_name, email}` — with `display_name` falling back to `users.raw_user_meta_data.full_name` | Bearer | `profiles` select + `auth.getUser()` in `getProfile()` |
| PATCH | `/account/profile` | `{display_name}` | `204` | Bearer | `profiles` update in `updateDisplayName()` |
| DELETE | `/account` | — | `204` | Bearer | `rpc('delete_own_account')` |

## 3. Spaces — `SpaceRepository`

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| GET | `/spaces` | — | `[{id, name, emoji, note_count, last_activity_at}]`, `deleted_at is null`, ordered `last_activity_at desc` | Bearer | `.from('spaces').select(SPACE_COLUMNS)` |
| POST | `/spaces` | `{name, emoji?}` (default `'💡'`) | one space, same shape | Bearer | `.insert({name, emoji})` |
| PATCH | `/spaces/{space_id}` | `{name}` (trimmed) | `204` | Bearer | `.update({name})` |
| DELETE | `/spaces/{space_id}` | — | `204` — **soft delete**, sets `deleted_at = now()` | Bearer | `.update({deleted_at})` |

## 4. Notes — `NoteRepository`

`NoteOut` = exactly `NOTE_COLUMNS`:
`id, title, content, type, color, x, y, width, height, parent_id, space_id, due_at, created_at`.

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| GET | `/spaces/{space_id}/notes` | — | `[NoteOut]`, `deleted_at is null` | Bearer | `listBySpace` |
| GET | `/notes/{note_id}` | — | `NoteOut` \| 404 | Bearer | `findById` (returns `null` on error today → client sees `null`; return 404 and let the adapter map it to `null`) |
| POST | `/spaces/{space_id}/notes` | `{content, type?='idea', x, y, parent_id?}` | `NoteOut` | Bearer | `create` — server sets `source_type='manual'` |
| PATCH | `/notes/{note_id}/content` | `{title?: string\|null, content}` | `204` | Bearer | `updateContent` — note it always writes `title` (null when absent) |
| PATCH | `/notes/{note_id}/color` | `{color}` | `204` | Bearer | `updateColor` |
| PATCH | `/notes/{note_id}/type` | `{type}` | `204` | Bearer | `updateType` |
| PATCH | `/notes/{note_id}/position` | `{x, y}` | `204` | Bearer | `updatePosition` — **must not emit a timeline event** |
| PATCH | `/notes/{note_id}/parent` | `{parent_id: string\|null}` | `204` | Bearer | `updateParent` |
| POST | `/notes/move` | `{moves: [{id, x, y}]}` | `204` | Bearer | `rpc('bulk_move_notes')` |
| DELETE | `/notes/{note_id}` | — | `204` — soft delete **+ promote children** | Bearer | `remove` + `t_promote_children_on_soft_delete` |

## 5. Groups — `GroupRepository`

`GroupOut` = `GROUP_COLUMNS`: `id, title, x, y, width, height, color`.

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| GET | `/spaces/{space_id}/groups` | — | `[GroupOut]`, `deleted_at is null` | Bearer | `listBySpace` |
| POST | `/spaces/{space_id}/groups` | `{title?, x, y, width?, height?}` | `GroupOut` | Bearer | `create` — width/height only sent when truthy |
| PATCH | `/groups/{group_id}` | Partial `GroupOut` minus `id` | `204` | Bearer | `update` |
| DELETE | `/groups/{group_id}` | — | `204` — soft delete | Bearer | `remove` |

## 6. Recordings — `RecordingRepository` + `RealtimePort` {#recordings}

`RecordingOut` mirrors the nested select in `listBySpace`:

```json
{
  "id": "…", "status": "completed", "error": null,
  "duration_ms": 12000, "created_at": "…", "storage_path": "uid/sid/rid.m4a",
  "transcripts": [{"text": "…"}],
  "sticky_notes": [{"id":"…","title":null,"content":"…","type":"idea","color":"#FFF8BC","deleted_at":null}]
}
```

Keep the nested arrays — `mappers.ts::toRecording` reads
`raw.transcripts?.[0]?.text` and filters `sticky_notes` on `deleted_at`.

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| GET | `/spaces/{space_id}/recordings` | — | `[RecordingOut]`, `created_at desc` | Bearer | `listBySpace` |
| POST | `/spaces/{space_id}/recordings` | `{duration_ms}` | `{id}` — status `'recorded'` | Bearer | `create` |
| GET | `/recordings/{id}/status` | — | `{status, error}` | Bearer | `getStatus` |
| POST | `/recordings/{id}/failed` | `{error}` | `204` | Bearer | `markFailed` |
| POST | `/recordings/{id}/completed` | — | `204` — sets `status='completed', error=null` | Bearer | `markCompleted` |
| GET | `/recordings/{id}/transcript-id` | — | `{transcript_id: string\|null}` | Bearer | `findTranscriptId` |
| **GET** | **`/recordings/{id}/events`** | — | **`text/event-stream`**, `data: {"status":…,"error":…}` | Bearer *(see note)* | **`RealtimePort.watchRecording`** |

SSE notes:

- The first event is the **current** row state, so the client no longer needs
  the seed `getStatus` call — but keep `getStatus` anyway, `useRecordingStatus`
  calls it and that file must not change.
- Send `: keepalive\n\n` every 15 s so proxies do not close the stream.
- Close the stream when `status ∈ {completed, failed}`.
- **Auth caveat:** `EventSource` cannot set headers. Two options — (a) accept
  `?access_token=` on this endpoint only, or (b) use `fetch`-based SSE in the
  adapter. **Choose (b)**: React Native has no `EventSource` anyway, and both
  adapters will hand-roll the stream read; putting a token in a query string
  puts it in access logs. Record the choice in `platform.ts`'s replacement.

## 7. Storage — `StoragePort`

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| POST | `/storage/recordings/presign-upload` | `{recording_id, space_id, ext, content_type, size_bytes?}` | `{url, key, headers}` — presigned PUT, 10 min | Bearer | `supabase.storage.from('recordings').upload(...)` |
| POST | `/storage/recordings/{recording_id}/uploaded` | `{key}` | `204` — sets `local_only=false, storage_path=key, status='uploading'` | Bearer | the `.update(...)` inside `uploadRecording` |
| POST | `/storage/recordings/sign` | `{key, expires_in?=3600}` | `{url}` — presigned GET | Bearer | `createSignedUrl` |

The server computes and validates the key itself:
`f"{user.id}/{space_id}/{recording_id}.{ext}"` — it does **not** accept a
client-supplied key for the upload presign. For `sign`, `assert_owns(key, user.id)`.

`StoragePort.uploadRecording` in the adapter becomes: presign → `PUT` the
bytes → `POST …/uploaded` → return the key. Same signature, same return value,
three round trips instead of two.

## 8. Models — `ModelRepository`

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| GET | `/models` | — | `[{id, provider, model_id, display_name, kind, credit_multiplier, tier, is_default}]` where `enabled`, ordered `kind, sort_order` | Bearer | `.from('ai_models')` |
| GET | `/models/preferences` | — | `{chat_model_id, transcribe_model_id}` | Bearer | `profiles` select |
| PUT | `/models/preferences` | `{kind: "chat"\|"transcribe", model_row_id: string\|null}` | `204` | Bearer | `profiles` update |

## 9. Credits — `CreditRepository`

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| GET | `/credits/balance` | — | `{credits_balance, credits_reserved}` | Bearer | `profiles` select |
| GET | `/credits/ledger?limit=50&offset=0` | — | `[{id, delta, balance_after, reason, created_at}]`, `created_at desc` | Bearer | `credit_ledger` select + `.range()` |
| GET | `/credits/packages` | — | `[CreditPackageOut]` where `enabled` | Bearer | *(no client reads this today; parity only)* |

## 10. BYOK keys — `KeyRepository`

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| GET | `/keys` | — | `[{id, provider, label, key_hint, is_active, last_error, created_at}]`, `created_at desc` | Bearer | `.from('user_ai_keys')` |
| POST | `/keys` | `{provider, apiKey, label?, baseUrl?}` | `{ok: true, keyHint}` | Bearer | `byok-save` |
| DELETE | `/keys/{key_id}` | — | `{ok: true}` | Bearer | `byok-delete` |

## 11. Billing — `BillingRepository`

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| GET | `/billing/plans` | — | `[{id, name, tagline, price_egp, total_credits, bonus_pct, is_featured, max_recording_minutes, is_byok, ai_enabled}]` where `enabled`, ordered `sort_order` | Bearer | `subscription_plans` select |
| GET | `/billing/subscription` | — | `{id, plan_id, status, channel, current_period_end}` \| `null` — newest `active` | Bearer | `subscriptions` select |
| GET | `/billing/providers` | — | `{providers: [{channel, displayName, isConfigured}]}` | Bearer | `subscribe-start` GET |
| POST | `/billing/subscriptions` | `{planId, channel?}` | `StartSubscriptionResult` | Bearer | `subscribe-start` POST |
| POST | `/billing/subscriptions/{id}/confirm` | `{receipt}` | `ConfirmSubscriptionResult` | Bearer | `subscribe-confirm` |

**`ai_enabled` must be added to `/billing/plans`** — the mobile `mappers.ts`
already reads `row.ai_enabled ?? true` and `useEntitlements` gates the whole
microphone on it, but the web `listPlans` select does **not** request the
column. That is a live bug on web (it always falls through to `?? true`, so free
users see the mic). Return the column from the API and both clients get it right.

## 12. AI — the pipeline

| Method | Path | Request | Response | Auth | Replaces |
|---|---|---|---|---|---|
| POST | `/ai/extract` | `{transcriptId, spaceId, parentNoteId?}` | `{aiActionId, noteIds: [...], creditsCharged}` | Bearer | `ai-extract` |
| POST | `/ai/note-write` | `{transcriptId, noteId}` | `{noteId, changed: bool, creditsCharged}` | Bearer | `ai-note-write` |
| POST | `/recordings/{id}/transcribe` | — | `{transcriptId, text, language}` | Bearer | `transcribe` |
| POST | `/ai/actions/{id}/apply` | `{accepted_item_ids: [uuid]}` | `204` | Bearer | `apply_ai_action` RPC *(dead code today — see [11 §Q3](11-risks-open-questions.md#q3))* |
| POST | `/ai/actions/{id}/undo` | — | `204` | Bearer | `undo_ai_action` RPC *(dead code today)* |

## 13. Timeline & relationships — parity only

| Method | Path | Response | Auth | Notes |
|---|---|---|---|---|
| GET | `/spaces/{space_id}/timeline?limit=50` | `[{id, type, ref_id, summary, created_at}]`, `created_at desc` | Bearer | No client reads it today |
| GET | `/spaces/{space_id}/relationships` | `[{id, from_note_id, to_note_id, type, created_by, created_at}]`, `deleted_at is null` | Bearer | No client reads it today |

**No write routes on either.** See [04 §B.2](04-authorization.md#b2-own--for-select-only-timeline_events).

## 14. Compat layer — `app/compat/functions_router.py`

Exact-parity endpoints so `FunctionsPort.invoke(name, body)` needs only a base
URL change.

| Method | Path | Dispatches to |
|---|---|---|
| POST | `/functions/transcribe` | `TranscriptionService.transcribe` |
| POST | `/functions/ai-extract` | `ExtractionService.extract` |
| POST | `/functions/ai-note-write` | `NoteWriteService.write` |
| POST | `/functions/byok-save` | `KeyService.save` |
| POST | `/functions/byok-delete` | `KeyService.delete` |
| GET | `/functions/subscribe-start` | `SubscriptionService.list_providers` |
| POST | `/functions/subscribe-start` | `SubscriptionService.start` |
| POST | `/functions/subscribe-confirm` | `SubscriptionService.confirm` |

Any other `{name}` → 404 `{"error": "unknown_function", "message": name}`.

## 15. Health

| Method | Path | Response | Auth |
|---|---|---|---|
| GET | `/health` | `{"status":"ok"}` — no DB touch, for the container healthcheck | — |
| GET | `/health/ready` | `{"status":"ok","db":"ok","storage":"ok"}` — pings Postgres and MinIO | — |

---

## Behavioural details that must survive verbatim

Copy these into the implementation as comments; each one is a bug someone
already fixed.

1. **`transcribe` sets `status='extracting'`, not `'transcribed'`,** on success
   (step 9), and clears `error`. The `'transcribed'` enum value is never used by
   the pipeline.
2. **`transcribe` settles at the estimate**, not at a measured cost — duration
   is known up front. `estimated = ceil(6 * duration_ms/60000 * credit_multiplier)`.
3. **`transcribe` deletes the audio for free-plan users** and nulls
   `storage_path` + sets `local_only=true`. `isFreePlan` = zero `credit_ledger`
   rows with `reason='purchase'`. (Stale relative to `0028`'s entitlement model —
   preserve, and see [11 §Q1](11-risks-open-questions.md#q1).)
4. **`ai-extract` charges `actual` from token usage**, falling back to
   `estimated` when the provider omitted `usage`:
   `actual = max(1, ceil(raw_cost_usd / USD_PER_CREDIT * credit_multiplier))`
   where `USD_PER_CREDIT = 0.01/10 = 0.001`.
5. **An empty extraction is a success, billed 0.** Returns
   `{aiActionId, noteIds: [], creditsCharged: 0}` and still writes the
   `ai_actions` row.
6. **`ai-note-write` appends, never overwrites** — unless the existing content is
   empty or the literal string `'New note'`, in which case it replaces.
   It only sets `title` when the note has no non-blank title.
   It only sets `due_at` when the model returned one.
7. **`ai-note-write` with empty output returns `{noteId, changed: false, creditsCharged: 0}`**
   and settles 0.
8. **Credits are reserved only when `usesPlatformKey`.** BYOK requests never
   touch credits, and `ai_actions.billed_to` records which.
9. **On any failure the reservation is released** and, for `transcribe`, the
   recording is marked `failed` with the error message. Release failures are
   logged and swallowed — *"never let a release failure mask the original error."*
10. **`subscribe-start` with `price_egp == 0`** creates an immediately-`active`
    subscription with `channel='test_pay'` and `current_period_end` 100 years
    out, writes **no** `payments` row, and returns `{subscriptionId, free: true, plan: {…, priceEgp: 0, credits: 0}}`.
    (No plan currently has price 0 — `0026` moved `byok` to 50 EGP — but the
    branch must stay.)
11. **`subscribe-confirm` grants nothing when `total_credits == 0`** — a zero
    grant would still append a ledger row rendering as "Credits purchased 0".
12. **`subscribe-confirm` charges the plan price, not the receipt's amount**, and
    402s on mismatch.
13. **`byok-save` live-validates only `openrouter`** keys, with a
    `openai/gpt-oss-120b` one-token chat call.
