# 11 — Risks and open questions

## Part 1 — Bugs and inconsistencies found while reading the current code

These are **not** hypothetical. Each was found in the repo during the research
for this plan. Decide about each *before* porting it; do not silently replicate
or silently fix.

### B1 — `ai-note-write` writes an `ai_actions.status` that does not exist

`supabase/functions/ai-note-write/index.ts` inserts:

```ts
const { data: action } = await admin.from('ai_actions').insert({ …, status: 'applied', … })
```

but `ai_action_status` (`0002_enums.sql`) is
`pending | proposed | accepted | partially_accepted | rejected | undone | failed`.
There is no `applied`.

**The insert therefore fails every time**, and the error is never checked —
the destructure takes only `data`, so `action` is silently `null` and the code
limps on via `action?.id ?? null`. Result: **no `ai_actions` row is ever written
for a note-write**, and `settle_credits` gets a null `ai_action_id`, so the
ledger row has no provenance.

**Decision:** use `'accepted'`. The write is applied immediately (unlike
extraction's `'proposed'`), so `accepted` is the honest label. **And note that
the FastAPI version will raise where the current one swallowed** — an `insert`
that fails will surface as a 500 unless you handle it. Add a test asserting an
`ai_actions` row exists after `POST /ai/note-write`.

### B2 — `ai_action_items.operation` is inconsistent between writer and reader

`ai-extract` writes `operation: 'insert'`, `target_type: 'sticky_note'`, and
`inverse_patch: { deleted_at: 'now()' }` — a literal **string**, not a
timestamp.

`apply_ai_action` / `undo_ai_action` (`0015`) branch on
`v_item.operation = 'create_note'` and `'create_relationship'`. They would match
nothing that `ai-extract` writes.

Both RPCs are dead code (see Q3), so this has never mattered. If you port them,
pick one vocabulary and use it in both places. Recommendation: keep
`ai-extract`'s `'insert'` (it is the one with real data behind it) and make the
apply/undo services branch on `target_type` instead.

### B3 — Web's `listPlans` does not select `ai_enabled`

`apps/web/src/infrastructure/supabase/repositories.ts::supabaseBillingRepository.listPlans`
selects
`id, name, tagline, price_egp, total_credits, bonus_pct, is_featured, max_recording_minutes, is_byok`
— **no `ai_enabled`**. Mobile's `mappers.ts` has
`aiEnabled: row.ai_enabled ?? true`; web's does not have the line at all.

`useEntitlements` gates the entire microphone on `aiEnabled`, so **on web, free
users see the AI recording button** when `0028_free_plan_without_ai.sql`
intended them not to.

Fixed for free by the migration: `GET /billing/plans` returns `ai_enabled` and
both clients pick it up. Add it to `mappers.ts` on web at the same time.

### B4 — `transcribe`'s free-plan test predates the entitlement model

```ts
async function isFreePlan(admin, userId) {
  const { count } = await admin.from('credit_ledger')
    .select('id', {count:'exact', head:true}).eq('user_id', userId).eq('reason','purchase');
  return (count ?? 0) === 0;
}
```
with the comment *"There is no plan column on profiles — the paid signal is
whether the user has ever completed a purchase."* That was true before `0024`
introduced `subscriptions`, and `0028` made `free` a real plan row.

Today a user on the `byok` plan (50 EGP, `total_credits = 900 > 0`) does get a
`purchase` ledger row, so they read as paid. But a user whose subscription
lapsed still reads as paid forever, because the ledger is append-only.

**Decision: preserve the behaviour verbatim** in `TranscriptionService`. Changing
it deletes audio for users who currently keep it, which is data loss. Open a
follow-up to switch to `EntitlementService.for_user(user_id).is_paid` and note
that the switch must be one-way-safe.

### B5 — `0020_delete_own_account.sql`'s comment is factually wrong

It says *"spaces.user_id / user_ai_keys.user_id carry no FK (RLS-only
ownership), so deleting auth.users would not cascade to them."*

`0007_core.sql`: `user_id uuid not null default auth.uid() references auth.users on delete cascade`.
`0005_user_ai_keys.sql`: the same.

Both **do** have FKs with `ON DELETE CASCADE`. The explicit deletes in the
function are redundant. Keep them (harmless, readable), but do not build
anything on the false premise.

### B6 — `user_ai_keys` upsert with a null label always inserts

`byok-save` does `upsert(..., { onConflict: 'user_id,provider,label' })`, and the
unique constraint is `(user_id, provider, label)`. In Postgres, `NULL` is never
equal to `NULL`, so a unique index containing a nullable column **does not
prevent duplicates when that column is null**. The key screen does not send a
label.

So saving the same provider twice with no label creates **two active rows**, and
`resolve_api_key`'s `.maybeSingle()` on `(user_id, provider, is_active)` would
error or pick arbitrarily.

**Decision:** preserve the schema, but make `KeyService.save` explicit:
`DELETE FROM user_ai_keys WHERE user_id=… AND provider=… AND label IS NOT DISTINCT FROM …`
then insert — or use `ON CONFLICT` with a partial unique index on
`(user_id, provider) WHERE label IS NULL`. **This is a behaviour change; flag it
to a human.** Meanwhile `resolve_api_key` must use
`ORDER BY created_at DESC LIMIT 1`, not `maybeSingle`, so a duplicate cannot 500.

### B7 — Two migrations share the prefix `0009`, two share `0022`

`0009_recording_status_extracting.sql` / `0009_timeline.sql` and
`0022_default_space.sql` / `0022_note_groups.sql`. Whichever order the Supabase
CLI applied them, the squashed Alembic baseline removes the ambiguity — but
record the linearization ([01 §2](01-current-surface.md#2-migration-inventory))
so anyone reconstructing history knows.

### B8 — `credit_ledger.ai_action_id` has no FK, and `sticky_notes.ai_action_id` has none either

Deliberate (it lets `settle_credits(..., p_ai_action => null)` work and lets
`ai-extract` reference an action id before the notes exist). Do **not** "tidy"
this by adding FKs during the model translation — it would break the ordering in
`ai-extract` and `ai-note-write`.

---

## Part 2 — Open questions requiring a human decision

### Q1 — Free-plan audio deletion {#q1}
See B4. **Preserve or modernise?** Recommendation: preserve, follow up
separately.

### Q2 — Email delivery for password reset {#q2}
GoTrue sent confirmation and recovery emails. FastAPI has no mail
infrastructure. `0016_email_auth_notes.sql` documents that confirmation is
**recommended ON** and that redirect URLs deep-link to `mindspace://`.

Three sub-questions, all unanswered:

1. **SMTP provider?** The `.env.example` in [07](07-docker.md) reserves
   `SMTP_*` but names no provider.
2. **Is email confirmation still required on sign-up?** If yes, `sign-up` must
   return `session: null` and the app's existing "check your inbox" path stays.
   If no, sign-up returns a session immediately — simpler, weaker.
3. **Deep link vs web page for the reset link?** `app.json` sets
   `"scheme": "mindspace"`, and the current config uses `mindspace://`. Web has
   no `/reset-password` route today (`apps/web/src/app/` has `sign-in` only), so
   a web reset flow needs a new page.

**Until this is decided, the migration cannot ship** — a user who forgets their
password has no recovery path. Minimum viable answer: SMTP via any transactional
provider, confirmation OFF for now (matching the friction users already tolerate
is a product call), and a new `apps/web/src/app/reset-password/page.tsx`.

### Q3 — Port `apply_ai_action` / `undo_ai_action`, or drop them? {#q3}
Grep proves neither is called from any client or edge function:

```
$ grep -rn "apply_ai_action\|undo_ai_action" apps/ supabase/
supabase/migrations/0015_apply_ai_action.sql:...   # definitions only
```

`ai-extract` inserts notes **directly** and sets `ai_actions.status = 'proposed'`,
which nothing ever transitions. The `ai_action_items` rows accumulate unused.

**Recommendation: port them** (`POST /ai/actions/{id}/apply`, `.../undo`). They
are ~60 lines each, the `ai_action_items` rows are already being written, and
the undo feature is clearly intended (`0008`'s comment: *"One reversible mutation
per item. Undo replays inverse_patch in reverse sort_order."*). But resolve B2
first, and route the undo's soft deletes through `NoteService._soft_delete_note`
so child promotion still fires.

**Alternative:** drop both and delete `ai_action_items` writes. Cheaper, and
honest about what ships today. **A human must pick.**

### Q4 — Does account deletion keep financial history? {#q4}
`0020`'s comment says *"Ledger/payment/reservation history is kept for
accounting even after the account is gone."* But `credit_ledger`,
`credit_reservations` and `payments` all declare
`user_id … references auth.users on delete cascade`, so deleting the user
**deletes all three**. The comment describes an intention the schema
contradicts.

Two options:
- **Match the schema** (history is deleted). Simplest, matches today's actual
  behaviour, and is friendlier to data-deletion requests.
- **Match the comment** (history is retained): change those three FKs to
  `ON DELETE SET NULL` with a nullable `user_id`, or copy rows to an archive
  table before deleting.

This is a **legal/accounting decision**, not a technical one. Ask.

### Q5 — Duplicate BYOK keys {#q5}
See B6. Fix the duplicate-insert behaviour, or preserve it? Fixing is a small
behaviour change users would experience as "saving a key replaces the old one",
which is almost certainly what they expect.

### Q6 — Long recordings vs the HTTP timeout {#q6}
`subscription_plans.max_recording_minutes` reaches **120** on `max` and `byok`.
A synchronous `POST /functions/transcribe` on a 2-hour recording will exceed any
reasonable reverse-proxy timeout, and the provider call itself is capped at 60 s
by `REQUEST_TIMEOUT_MS`.

This is **already broken today** — the Supabase edge runtime has its own wall
clock, which is exactly why `openaiCompatible.ts` added the 60 s cap
(*"the edge function gets killed by the platform wall clock and the client only
sees 'Edge Function returned a non-2xx status code' with no body"*).

The migration **preserves the current behaviour** (see
[02](02-target-architecture.md#background-work)). But set the reverse proxy's
read timeout above 60 s so the `provider_timeout` 504 can actually be returned,
and open a follow-up for arq + a job status endpoint. `RealtimePort` already
gives the client a status stream, so the async version needs no client change
beyond making the pipeline fire-and-watch.

### Q7 — Multi-worker SSE
The plan pins `--workers 1`. When traffic requires more, switch
`recordings/events.py` to Postgres `LISTEN/NOTIFY` on channel
`recording_status`. Decide whether to build that now (cheap: ~40 lines, and it
removes a footgun) or later. **Recommendation: build it now.** A future operator
adding `--workers 4` would break the status banner silently, with no error
anywhere.

### Q8 — Which Postgres role does FastAPI connect as?
If you take the strangler approach A ([09](09-phases.md#strangler-fig-option)) —
FastAPI against the Supabase database — the role must **bypass RLS**, or every
query returns zero rows because `auth.uid()` is null outside PostgREST. Use
`postgres`, or create a role with `BYPASSRLS`. **Get this right before the first
integration test against the shared database, or you will spend a day debugging
empty result sets.**

### Q9 — `pgvector` and `pg_net`
`0001_extensions.sql` installs both; nothing in the repo references either. The
plan drops them. Confirm no unreleased branch depends on `vector` before
dropping it — re-adding it later is trivial (`CREATE EXTENSION`), so the risk is
low.

### Q10 — Rate limiting
Supabase applied its own rate limits to auth and edge functions. FastAPI has
none. `POST /auth/sign-in` and `POST /keys` (which makes a live provider call)
are the obvious targets. Not in scope for parity, but note it: **the migration
removes a protection that existed**. Add `slowapi` or a reverse-proxy rate limit
before production.

---

## Part 3 — Risk register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **A cross-user data leak from a missed RLS policy** | Catastrophic | Medium | [04](04-authorization.md) + the parametrised matrix in [10](10-testing.md#authorization-test-matrix), driven off `Base.metadata.tables` so a new table cannot be forgotten |
| `BYOK_MASTER_KEY` lost or wrong | Every user's provider key is unrecoverable | Low | Collect it in [08 §0](08-data-migration-runbook.md#0-before-you-start); the decrypt-all verification script is a hard gate before cutover |
| Password hashes not portable | Every user forced to reset | Low | Verified in [08 §3](08-data-migration-runbook.md#3-transform-authusers) **before** any code is written against bcrypt |
| Credit double-spend under concurrency | Money | Medium | `FOR UPDATE` preserved verbatim; the 20× concurrency test in [10](10-testing.md#test_creditspy) |
| Double credit grant on payment retry | Money | Medium | `(channel, external_ref)` unique constraint preserved; verify → record → grant ordering preserved; double-confirm test |
| Timeline events lost for AI-created notes | Silent data gap | **High** — this is the easiest thing to miss | Called out in [01 §2.5](01-current-surface.md#25-triggers--python) and [09 Phase 7](09-phases.md#phase-7--ai-extraction--note-write); explicit acceptance criterion |
| Child notes orphaned on soft delete | Notes permanently invisible (the exact bug `0021` fixed) | **High** | Single `_soft_delete_note()` choke point; test asserts promotion from **both** the DELETE route and the undo path |
| Error codes collapse to a generic message | Every failure looks the same; the top-up sheet never opens | **High** | Error-envelope handler in Phase 1 with its own test file; the full code table in [05](05-api-contract.md#error-envelope) |
| SSE does not work in React Native | The status banner freezes on "Saved on device…" (the exact bug `0018` fixed) | Medium | Verify on device in [09 Phase 11](09-phases.md#phase-11--frontend-adapters-mobile); polling fallback is pre-approved |
| Presigned URLs unreachable from a phone | Uploads fail on device but work on the dev machine | **High** | `S3_PUBLIC_ENDPOINT_URL` documented in [07](07-docker.md#s3_public_endpoint_url--the-presign-gotcha); `make lan-ip` |
| Mobile cannot be rolled back | A bad release is stuck until the next store review | Medium | Remote feature flag **or** the strangler window — pick one before Phase 11 |
| Prompt drift changes extraction quality | Notes get worse and nobody notices | Low | Copy `EXTRACT_THOUGHTS_SYSTEM` / `WRITE_NOTE_SYSTEM` **verbatim**; keep `extract_thoughts@8` / `write_note@1` so `ai_actions.prompt_version` stays comparable across the cutover |
| Layout regression | Notes overlap on the canvas | Medium | Port `layout.test.ts` case for case |
| Alembic baseline drifts from the models | `autogenerate` produces spurious diffs forever | Medium | `alembic check` in CI; the empty-autogenerate acceptance criterion in Phase 1 |
| Scheduler runs twice | Duplicate refills | Low | `RUN_SCHEDULER` on one replica + advisory lock per job |
| Rate limiting removed | Credential stuffing, provider-key abuse | Medium | Q10 — add before production |
