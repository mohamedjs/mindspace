# 08 — The backend contract (do not change any of it)

Everything in this file already exists and is deployed. Your job is to call it
correctly from the web client. **No file under `supabase/` should appear in your
diff.**

## 8.1 Edge functions — request and response shapes

Called through `FunctionsPort.invoke(name, body)`.

| Function | Request body | Success response |
|---|---|---|
| `transcribe` | `{ recordingId }` | `{ transcriptId, text, language }` |
| `ai-extract` | `{ transcriptId, spaceId, parentNoteId }` | `{ aiActionId, noteIds, creditsCharged }` |
| `ai-note-write` | `{ transcriptId, noteId }` | `{ noteId, changed, creditsCharged }` |
| `byok-save` | `{ provider, apiKey, label?, baseUrl? }` | `{ ok: true, keyHint }` |
| `byok-delete` | `{ keyId }` | `{ ok: true }` |
| `subscribe-start` | `{ planId, channel }` — or **`GET`** with no body to list providers | `{ subscriptionId, reference?, plan, intent?, free? }` / `{ providers }` |
| `subscribe-confirm` | `{ subscriptionId, receipt }` | `{ subscriptionId, status, creditsGranted, alreadyActive? }` |

Errors come back as `{ error: '<code>', … }` with a non-2xx status.
`infrastructure/supabase/functions.ts` turns that into a `PipelineError` **with
the code intact** — see `07` §7.5 for why that matters and the full code list.

`ai-extract` returns `{ aiActionId, noteIds: [], creditsCharged: 0 }` when the
transcript yields nothing. That is a success, not an error — do not show a
failure toast for it.

## 8.2 Credits

| Operation | Cost |
|---|---|
| Transcription | **6 credits per minute** of audio × the model's `credit_multiplier` |
| Extraction | **8 credits** estimated, settled against actual token cost |
| Everything else | free |

Roughly 10 credits ≈ 1 EGP of underlying spend (`USD_PER_CREDIT = 0.01 / 10`).

**Reserve → settle → release.** `reserve_credits(amount, reason)` holds an
estimate before the call; `settle_credits(...)` charges the real cost on
success; `release_credits(reservationId)` returns the hold on failure. **A
failed recording is never charged.** All three are `security definer` RPCs
reading `auth.uid()` — the client cannot forge them.

New accounts get **100 credits** on signup (`handle_new_user` trigger, migration
`0003`). A cron (`0012`) runs `monthly_free_refill()` on the 1st at 02:00,
bringing any balance **below 100 back up to 100** — floor, not accumulation.

> Known and unfixed: that refill has **no plan filter**, so a paid subscriber who
> burns through their credits is also topped back up to 100. Documented in the
> main README. Do not "fix" it during the port.

Available balance shown in the UI is `creditsBalance - creditsReserved`.

## 8.3 Plans — live values

| id | Name | EGP/mo | Credits | Max recording | `isByok` |
|---|---|---|---|---|---|
| `hobby` | Hobby | 50 | 625 (+25%) | 15 min | no |
| `plus` | Plus ⭐ | 150 | 2,025 (+35%) | 30 min | no |
| `pro` | Pro | 300 | 4,500 (+50%) | 60 min | no |
| `max` | Max | 500 | 8,000 (+60%) | 120 min | no |
| `byok` | Your AI | 50 | 900 (transcription only) | 120 min | **yes** |

Free tier: 100 credits, 5-minute cap, no `subscription_plans` row — it is the
absence of a subscription.

**Read these from `listPlans()` at runtime.** Never hard-code them in the web
client; the table above is for your understanding only.

## 8.4 BYOK — the split that must not be broken

- **Text → sticky notes** runs on the user's own key. Billed by their provider.
  Zero credits.
- **Voice → text** *always* runs on the platform's OpenRouter key. Billed in
  credits. **Even on the BYOK plan.** That is why the plan is 50 EGP and
  includes 900 credits.

Enforced server-side in `_shared/models.ts`: `resolveModel` prefers a provider
the user holds a key for **only when `kind === 'chat'`**. Transcription
deliberately does not follow user keys.

This closed a silent billing bug: `resolveApiKey` looks up a key by the
*resolved model's* provider, so a user with an Anthropic key but a stale
OpenRouter preference would run on the platform key and be charged, while the UI
showed Anthropic.

Only three providers can back a user key: `openai`, `anthropic`, `google`
(migration `0027` disables anything else). **Anthropic is chat-only** — its
OpenAI-compatibility layer documents that audio input is ignored and stripped,
so it can never serve a transcribe model.

The web client's job: show only those three on `/keys`, filter the chat model
picker to providers the user holds a key for, and never suggest the user's key
covers transcription.

## 8.5 Payments

Four channels behind a server-side factory. **Verification is always
server-side** — the client never decides a payment succeeded.

| Channel | Status |
|---|---|
| `test_pay` | Works. Gated on the `ALLOW_TEST_PAY` env flag |
| `google_pay` | Throws `provider_not_configured` — needs Play Console credentials |
| `apple_pay` | Throws `provider_not_configured` — needs App Store Connect key |
| `instapay` | Throws `provider_not_configured` — needs a gateway (Paymob / Fawry / Kashier) |

`listPaymentProviders()` returns `{ channel, displayName, isConfigured }`. The
UI must disable unconfigured channels rather than let a user pick one and fail.

**Confirm is idempotent** by design: `payments` carries `unique (channel,
external_ref)`, and `subscribe-confirm` **claims the payment row before granting
credits**. Two confirms produce one payment row and one grant — verified by test
at the SQL level. So a retried confirm after a flaky network is safe; do not add
client-side de-duplication that would mask a genuine failure.

`grant_credits` is skipped entirely when `total_credits === 0`, so BYOK does not
leave a "Credits purchased 0" ledger row.

> Renewal is **not** automated. Confirm grants once and stores
> `current_period_end`; nothing advances it. Logged in the main README.

### Google Pay / Apple Pay on the web

Both native channels are unimplemented anyway, so the port loses nothing today.
But note for planning: **the web cannot use Play Billing or StoreKit at all.**
When those are wired up, the web app will need a card gateway or InstaPay,
independent of the mobile channels. Add it to `10-open-questions.md`.

## 8.6 Database — tables you read and write

**User-owned** (RLS `auth.uid() = user_id`), full CRUD from the client:
`spaces`, `sticky_notes`, `note_groups`, `recordings`, `transcripts`,
`relationships`, `ai_actions`, `ai_action_items`, `user_ai_keys`.

**Read-only from the client:** `profiles` (own row; updates limited to
preferences by the `guard_profile_update` trigger), `credit_ledger`,
`credit_reservations`, `payments`, `subscriptions`, `timeline_events`.

**Catalogue, readable by any signed-in user:** `ai_models` (enabled only),
`credit_packages`, `subscription_plans` (enabled only).

### RPCs the client calls

| RPC | Used by |
|---|---|
| `bulk_move_notes(...)` | Cluster drag — parent + descendants in one call |
| `delete_own_account()` | Settings → Delete account |
| `apply_ai_action` / `undo_ai_action` | AI action application / undo |

`reserve_credits`, `settle_credits`, `release_credits`, `grant_credits` are
**server-only** (`grant_credits` is explicitly revoked from `authenticated`).

### Triggers that affect what you see

| Trigger | Effect |
|---|---|
| `handle_new_user` | Creates the profile + 100-credit signup grant |
| `promote_children_on_soft_delete` | Deleting a note **promotes its sub-notes** to the parent's level rather than deleting them. Your UI must expect children to survive a parent delete |
| `guard_profile_update` | Blocks client updates to anything but preferences |
| `on_note_change` | Writes `timeline_events` |
| `touch_updated_at` | On `sticky_notes` and `spaces` |

### Migration numbering hazard

There are **two migrations numbered `0022`** (`0022_default_space.sql` and
`0022_note_groups.sql`). Both are applied on the live project, so nothing is
broken — but a fresh `supabase db push` against a clean database has ambiguous
ordering. Do not renumber them as part of this port (it would desynchronise the
applied migration history); just be aware if you spin up a local stack.

## 8.7 The prompts — read them, do not touch them

`supabase/functions/_shared/prompts/extractThoughts.ts` is at version
`extract_thoughts@8`. Its behaviour defines the product:

- Splits a transcript into **distinct ideas**, not sentences.
- **Rewrites** each into clean prose — the rule is "WRITE IT PROPERLY, DON'T
  TRANSCRIBE IT" — while preserving the speaker's certainty level and language.
- Emits `clientKey`, `title`, `content`, `type`, `parentClientKey`, `dueAt`,
  `spanStart`/`spanEnd`, `color`.
- Colour is normally **omitted**: the app colours notes by type. The model only
  sets it when the speaker names a colour.
- `dueAt` is resolved against today's date in the user's timezone, passed in as
  a `PromptClock { today, timezone, weekday }` built from `profiles.timezone`.

`writeNote.ts` (`write_note@1`) returns one note: `{ title, content, dueAt }`.

The Zod schema is **mirrored** in two places: `src/features/ai/schemas/extraction.ts`
(client) and `supabase/functions/_shared/extraction.ts` (edge). They must stay
identical. You are copying the client one verbatim, so they will.

## 8.8 Environment flags currently set on the Supabase project

For your awareness — **you are not changing these**:

- `ALLOW_TEST_PAY` is **enabled**. While it is on, anyone can subscribe for free.
  It must be unset before the app takes real money, on web or native.
- No OpenAI / Anthropic / Google keys exist on the platform. Those providers are
  `byok_only` for exactly that reason, and the BYOK paths have **never been
  exercised with a live key**. If you find a bug there, it predates the port.
