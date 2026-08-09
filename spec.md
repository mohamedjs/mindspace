# MindSpace — MVP Implementation Spec

**Single source of truth for building the MVP.**
Stack: Expo (React Native + TypeScript) + Supabase. No separate backend.
Monetization: prepaid credits in EGP. AI: OpenRouter by default, BYOK for any provider.

Read this whole file before writing code. Where this file conflicts with any
earlier document, **this file wins**.

---

## Table of Contents

1. [Product Scope](#1-product-scope)
2. [Verified Pricing Inputs](#2-verified-pricing-inputs)
3. [The Credit System](#3-the-credit-system)
4. [Credit Packages (50–500 EGP)](#4-credit-packages-50500-egp)
5. [AI Provider Architecture](#5-ai-provider-architecture)
6. [Model Catalog](#6-model-catalog)
7. [BYOK — User API Keys](#7-byok--user-api-keys)
8. [Database Schema](#8-database-schema)
9. [Row Level Security](#9-row-level-security)
10. [Credit RPCs — Reserve & Settle](#10-credit-rpcs--reserve--settle)
11. [Edge Functions](#11-edge-functions)
12. [Prompts & Schemas](#12-prompts--schemas)
13. [Client Architecture](#13-client-architecture)
14. [Screens](#14-screens)
15. [Payments — Critical Constraint](#15-payments--critical-constraint)
16. [Build Order](#16-build-order)
17. [Acceptance Criteria](#17-acceptance-criteria)
18. [Config Reference](#18-config-reference)

---

## 1. Product Scope

### What MindSpace is

A voice-first thinking space. The user talks, AI turns speech into sticky notes
with hierarchy on an infinite canvas, and the original recording is never lost.

### The MVP loop — build this and nothing else first

```
Create Space → 🎙 talk 40s → transcript → AI extracts 4–6 notes with hierarchy
→ notes animate onto canvas → drag / zoom → open note → replay original voice → edit
```

### In scope for MVP

Spaces · infinite canvas · sticky notes (7 types) · voice recording · transcription ·
AI extraction with hierarchy · AI approval sheet · undo · provenance (replay original
audio + transcript highlight) · relationships (AI + manual) · manual note creation ·
timeline · **credit system** · **model picker** · **BYOK**

### Out of scope for MVP

Graph view · images · comments · Mind Detox · Daily Extract · Free My Mind ·
Morning Return · semantic search · collaboration · web app

### Non-negotiable product rules

1. **Never lose the original recording.** Every AI note links back to audio + transcript span.
2. **AI proposes, user accepts.** No silent mutations. Everything undoable.
3. **Max 6 notes per 60 seconds of speech.** Never one note per sentence. Minimum hierarchy depth 2.
4. **No clinical language anywhere.** Reflection features are focus and decluttering tools, never therapy or treatment.
5. **No provider API key ships in the app.** Keys live only in Edge Function env or encrypted in the DB.

---

## 2. Verified Pricing Inputs

All costs verified August 2026. Store these in the `ai_models` table, **never
hard-code them in application logic** — provider prices change monthly.

### Text model (default)

`openai/gpt-oss-120b` via OpenRouter — <cite index="27-1">$0.03 per million input tokens, $0.17 per million output tokens, 131K context window, with function calling and structured output support</cite>.

Note: <cite index="6-1">OpenRouter is the cheapest of 18 providers for this model, but the floor price has risen roughly 28% over 90 days</cite> — another reason prices belong in a database row, not in code.

### Transcription model (default)

`openai/gpt-transcribe` — <cite index="16-1">released July 28, 2026, priced at $0.0045 per minute of audio, 25% below whisper-1 and gpt-4o-transcribe. On Common Voice across 22 languages, word error rate drops from 40.37% with whisper-1 to 19.27%</cite>. <cite index="16-1">OpenAI's transcription guide now recommends starting with gpt-transcribe.</cite>

Fallbacks: <cite index="15-1">gpt-4o-transcribe at $0.006/min, gpt-4o-mini-transcribe at $0.003/min</cite>.

### FX rate

USD/EGP is roughly **50** as of August 2026, having ranged 46.6–54.9 during the
year. Use **`FX_EGP_PER_USD = 50`** with **`FX_BUFFER = 1.15`** → effective
planning rate **57.5 EGP per USD**. Store both as Edge Function env vars so you
can adjust without a deploy.

### Cost of one 60-second thinking cycle

| Step | Tokens / minutes | Raw USD | Raw EGP (@57.5) |
| --- | --- | --- | --- |
| Transcription | 1.0 min @ $0.0045 | $0.004500 | 0.259 |
| Extraction — input | ~2,400 tok @ $0.03/M | $0.000072 | 0.004 |
| Extraction — output | ~900 tok @ $0.17/M | $0.000153 | 0.009 |
| **Total** | | **$0.004725** | **0.272 EGP** |

**Transcription is ~95% of your cost.** The LLM is nearly free at this model
tier. Every optimization effort belongs on audio minutes, not on prompt tokens.

Practical consequences, implement all three:
- **Trim silence client-side** before upload (`expo-audio` metering threshold).
- **Cap free-tier recordings at 3 minutes.**
- Offer `gpt-4o-mini-transcribe` (0.67× cost) as a "save credits" option in Settings.

---

## 3. The Credit System

### Definition

```
1 credit = 0.10 EGP of retail value
```

Chosen so the arithmetic is obvious to an Egyptian user: **10 credits = 1 EGP**,
**500 credits = 50 EGP**. Never show USD in the UI.

### Action price list (base credits, at multiplier 1.0)

| Action | Base credits | EGP | Raw cost | Markup |
| --- | --- | --- | --- | --- |
| Transcription, per started minute | **6** | 0.60 | 0.259 | 2.3× |
| Extract notes from a transcript | **2** | 0.20 | 0.013 | 15× |
| **Full 1-min cycle** | **8** | **0.80** | **0.272** | **2.9×** |
| Weekly digest (Phase 2 feature) | 10 | 1.00 | ~0.05 | 20× |
| Thought evolution / Help me think | 5 | 0.50 | ~0.03 | 17× |
| Manual note, drag, edit, replay audio | **0** | — | — | — |

**Only AI calls consume credits.** Using the canvas is always free — this matters
because the canvas is the product and a user who fears the meter stops thinking.

### Charging formula

```
credits_charged = ceil( base_credits × model.credit_multiplier )

transcription: base = 6 × ceil(duration_seconds / 60)
extraction:    base = 2
```

### How `credit_multiplier` is derived

Baseline is `gpt-oss-120b` at a reference workload of 2,400 input + 900 output
tokens:

```
reference_cost_md = 2.4 × input_price_per_M + 0.9 × output_price_per_M
                    (md = milli-dollars)

gpt-oss-120b: 2.4 × 0.03 + 0.9 × 0.17 = 0.072 + 0.153 = 0.225 md  → multiplier 1.0

credit_multiplier = max(1.0, round( reference_cost_md / 0.225, 1 ))
```

Worked examples:

| Model | $/M in | $/M out | Multiplier | Credits per extraction |
| --- | --- | --- | --- | --- |
| `openai/gpt-oss-120b` | 0.03 | 0.17 | **1.0** | 2 |
| A ~$0.10/$0.40 fast model | 0.10 | 0.40 | 2.7 | 6 |
| A ~$0.25/$2.00 mid model | 0.25 | 2.00 | 10.7 | 22 |
| A ~$3/$15 frontier model | 3.00 | 15.00 | 92.0 | 184 |

Transcription multipliers are the ratio of per-minute price to $0.0045:

| Transcription model | $/min | Multiplier | Credits/min |
| --- | --- | --- | --- |
| `openai/gpt-transcribe` | 0.0045 | **1.0** | 6 |
| `openai/gpt-4o-mini-transcribe` | 0.0030 | 0.7 | 5 |
| `openai/gpt-4o-transcribe` | 0.0060 | 1.3 | 8 |

Recompute multipliers with a nightly `pg_cron` job that reads live prices from
`GET https://openrouter.ai/api/v1/models` and updates the `ai_models` rows.
**This is the whole point of putting prices in the database.**

### Free tier

```
Every new user receives 100 credits (= 10 EGP) on signup.
Balance is topped back up to 100 credits on the 1st of each month —
it does NOT accumulate. Purchased credits never expire.
```

100 credits ≈ **12 one-minute cycles per month** ≈ 12 minutes of thinking.
Your cost per free user: **~3.3 EGP (~$0.06) per month, hard-capped.**

Free-tier restrictions:
- Max recording length: 3 minutes
- Model choice locked to the default (`gpt-oss-120b` + `gpt-transcribe`)
- No weekly digest

### Balance display

Show credits, EGP, and a human unit together. Never show only a raw number:

```
┌────────────────────────────┐
│  340 credits · 34 EGP      │
│  ≈ 42 minutes of thinking  │
│  [ Add credits ]           │
└────────────────────────────┘
```

Warn at 50 credits, block at 0 with a clear message — never fail silently mid-recording.

---

## 4. Credit Packages (50–500 EGP)

| Package | Price | Base | Bonus | **Total credits** | ≈ minutes | Effective EGP/min |
| --- | --- | --- | --- | --- | --- | --- |
| **Free** | 0 | 100 | — | **100** | ~12 | — |
| **Starter** | 50 EGP | 500 | +10% | **550** | ~68 | 0.73 |
| **Regular** ⭐ | 100 EGP | 1,000 | +20% | **1,200** | ~150 | 0.67 |
| **Pro** | 250 EGP | 2,500 | +30% | **3,250** | ~406 | 0.62 |
| **Max** | 500 EGP | 5,000 | +40% | **7,000** | ~875 | 0.57 |

Minutes assume the default models at 8 credits per one-minute cycle.

### Margin check (worst case: 100% of credits consumed, no breakage)

| Package | Revenue | Raw AI cost | Gross margin | After 30% store fee |
| --- | --- | --- | --- | --- |
| Starter 50 | 50 | 18.7 | **63%** | 47% |
| Regular 100 | 100 | 40.8 | **59%** | 41% |
| Pro 250 | 250 | 110.5 | **56%** | 37% |
| Max 500 | 500 | 238.0 | **52%** | 32% |

Real margins run higher — typical prepaid breakage is 30–50%. But **model the
worst case**, because the one user who burns every credit is the one who also
tells you your pricing is wrong.

Mark **Regular (100 EGP)** as the recommended package. It's the best
margin-to-perceived-value point and gives a genuinely useful 150 minutes.

### Adjust before launch if

- FX moves past ~57 EGP/USD → raise transcription to 7 credits/min
- Users average under 45 seconds per recording → per-started-minute rounding
  already gives you margin; consider 30-second billing granularity as a
  goodwill feature

---

## 5. AI Provider Architecture

### Three phases, one interface

```
Phase A (MVP)     Platform OpenRouter key, single default model. User picks nothing.
Phase B           Model picker. User chooses from the ai_models catalog. Still platform key.
Phase C           BYOK. User adds their own OpenRouter / OpenAI / Google / Anthropic /
                  NVIDIA / custom key. Their calls cost 0 credits.
```

All three use the same interface. Phase B is a DB insert plus a picker screen.
Phase C adds a key vault. **No refactor between phases** — build the interface
correctly in Phase A.

### The port

```ts
// supabase/functions/_shared/providers/types.ts
export type ProviderId =
  | 'openrouter' | 'openai' | 'google' | 'anthropic' | 'nvidia' | 'custom';

export interface ChatProvider {
  readonly id: ProviderId;
  chat(req: ChatRequest): Promise<ChatResult>;
}

export interface TranscribeProvider {
  readonly id: ProviderId;
  transcribe(req: TranscribeRequest): Promise<TranscribeResult>;
}

export type ChatRequest = {
  modelId: string;              // provider-native id, e.g. 'openai/gpt-oss-120b'
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode: boolean;
  apiKey: string;               // platform key OR the user's decrypted key
  baseUrl?: string;             // for 'custom'
};

export type ChatResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  rawUsd?: number;              // OpenRouter returns this; others we compute
};
```

### Adapters — all OpenAI-compatible except Google and Anthropic

```
supabase/functions/_shared/providers/
  openrouter.ts    POST {baseUrl}/chat/completions   default baseUrl https://openrouter.ai/api/v1
  openai.ts        POST https://api.openai.com/v1/chat/completions      (same body shape)
  nvidia.ts        POST https://integrate.api.nvidia.com/v1/chat/completions
  custom.ts        POST {user_supplied_base_url}/chat/completions
  google.ts        POST https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent
  anthropic.ts     POST https://api.anthropic.com/v1/messages
  index.ts         getChatProvider(id) → ChatProvider
```

Four of six adapters are the same 30 lines with a different base URL. Write
`openaiCompatible(baseUrl)` once and reuse it. Only Google and Anthropic need
real request/response mapping.

### Resolution order at call time

```
1. Does the user have an active key for the model's provider?
   → yes: use it, charge 0 credits, mark ai_actions.billed_to = 'byok'
   → no:  continue

2. Is the model's provider 'openrouter' (the only platform-funded provider)?
   → yes: use PLATFORM_OPENROUTER_KEY, charge credits
   → no:  reject with NEEDS_OWN_KEY — the client shows "Add your OpenAI key"

3. Reserve credits → call → settle credits
```

**You only fund OpenRouter.** Direct OpenAI/Google/Anthropic access is BYOK-only.
This keeps one billing relationship and one place where cost can surprise you.

---

## 6. Model Catalog

The model list lives in the database. Adding a model is one `INSERT` — no app
release, no Edge Function deploy.

### Seed rows for MVP

```sql
insert into ai_models
 (provider, model_id, display_name, kind, input_price_m, output_price_m,
  price_per_min, credit_multiplier, is_default, tier, enabled, sort_order)
values
 -- ===== TEXT — MVP default =====
 ('openrouter','openai/gpt-oss-120b','GPT-OSS 120B','chat',
   0.03, 0.17, null, 1.0, true, 'free', true, 10),

 -- ===== TRANSCRIPTION — MVP default =====
 ('openrouter','openai/gpt-transcribe','GPT Transcribe','transcribe',
   null, null, 0.0045, 1.0, true, 'free', true, 10),
 ('openrouter','openai/gpt-4o-mini-transcribe','GPT-4o Mini Transcribe','transcribe',
   null, null, 0.0030, 0.7, false, 'free', true, 20),
 ('openrouter','openai/gpt-4o-transcribe','GPT-4o Transcribe','transcribe',
   null, null, 0.0060, 1.3, false, 'paid', true, 30);
```

Phase B appends more OpenRouter models. Phase C appends `provider='openai'`,
`'google'`, `'anthropic'`, `'nvidia'` rows with `byok_only = true`.

**Do not hard-code model IDs anywhere in the client or in Edge Function logic.**
Resolve them from `ai_models` at request time. When adding new models, verify
current pricing against `https://openrouter.ai/models` and let the nightly sync
job correct the multipliers.

### Model picker UI (Phase B)

```
┌──────────────────────────────┐
│  Model for notes             │
│                              │
│  ● GPT-OSS 120B      2 cr    │
│    Fast · Recommended        │
│                              │
│  ○ [mid-tier model] 22 cr    │
│    Better hierarchy          │
│                              │
│  ○ [frontier]      184 cr    │
│    Best · Needs own key      │
│                              │
│  Transcription               │
│  ● GPT Transcribe    6 cr/min│
│  ○ Mini              5 cr/min│
└──────────────────────────────┘
```

Always show the credit cost next to the model name. A user choosing a 92×
multiplier model deserves to know before, not after.

---

## 7. BYOK — User API Keys

### Storage — never plaintext

Encrypt with AES-256-GCM inside the Edge Function using `BYOK_MASTER_KEY` (a
32-byte secret in Edge Function env). Store ciphertext + IV + auth tag in
`bytea`. The key never reaches the client after submission, and never appears
in logs.

```ts
// supabase/functions/_shared/crypto.ts
const masterKey = await crypto.subtle.importKey(
  'raw',
  decodeBase64(Deno.env.get('BYOK_MASTER_KEY')!),
  { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
);

export async function sealKey(plain: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, masterKey, new TextEncoder().encode(plain)
  ));
  return concat(iv, ct);            // iv(12) || ciphertext+tag
}
```

### Rules

- `SELECT` on `user_ai_keys.encrypted_key` is **revoked from `authenticated`**.
  The client can read `provider`, `label`, `key_hint`, `is_active` — never the blob.
- On save, immediately validate the key with a 1-token test call. Reject invalid keys.
- Show only the last 4 characters (`key_hint`).
- On a `401` from the provider, set `is_active = false` and notify the user.
- BYOK calls: `credits_charged = 0`, `billed_to = 'byok'`. Still write an
  `ai_actions` row so the user sees usage.

### Add-key screen

```
┌──────────────────────────────┐
│  Your AI keys                │
│                              │
│  OpenRouter    ····a3f9   ✓  │
│  OpenAI        ····7b21   ✓  │
│  + Add a key                 │
│                              │
│  Calls with your own key     │
│  cost 0 credits.             │
└──────────────────────────────┘
```

That last line is the entire pitch for BYOK, and it converts technical users who
would otherwise churn on price.

---

## 8. Database Schema

Supabase Postgres. One migration per logical group, numbered, never edited after ship.

```sql
-- ============================================================
-- 0001_extensions.sql
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vector;

-- ============================================================
-- 0002_enums.sql
-- ============================================================
create type note_type as enum
  ('idea','task','question','decision','reference','thought','summary');
create type rel_type as enum
  ('related','depends_on','supports','contradicts','derived_from','child_of');
create type source_type as enum ('voice','manual','ai');
create type recording_status as enum
  ('recorded','uploading','transcribing','transcribed','failed');
create type ai_action_kind as enum
  ('extract_thoughts','detect_relations','thought_evolution','weekly_digest');
create type ai_action_status as enum
  ('pending','proposed','accepted','partially_accepted','rejected','undone','failed');
create type provider_id as enum
  ('openrouter','openai','google','anthropic','nvidia','custom');
create type model_kind as enum ('chat','transcribe');
create type ledger_reason as enum
  ('signup_grant','monthly_refill','purchase','usage','refund','reversal','admin_adjust');

-- ============================================================
-- 0003_profiles.sql
-- ============================================================
create table profiles (
  id                uuid primary key references auth.users on delete cascade,
  display_name      text,
  is_anonymous      boolean not null default true,
  credits_balance   int not null default 0,     -- authoritative, mutated only by RPC
  credits_reserved  int not null default 0,     -- in-flight holds
  free_refill_at    date,                       -- last monthly top-up
  chat_model_id     uuid,                       -- fk added after ai_models
  transcribe_model_id uuid,
  timezone          text not null default 'Africa/Cairo',
  locale            text not null default 'en',
  created_at        timestamptz not null default now(),
  constraint credits_non_negative check (credits_balance >= 0),
  constraint reserved_non_negative check (credits_reserved >= 0)
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into profiles (id, is_anonymous, credits_balance, free_refill_at)
  values (new.id, coalesce(new.is_anonymous, true), 100, current_date);

  insert into credit_ledger (user_id, delta, balance_after, reason)
  values (new.id, 100, 100, 'signup_grant');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 0004_ai_models.sql
-- ============================================================
create table ai_models (
  id                uuid primary key default gen_random_uuid(),
  provider          provider_id not null,
  model_id          text not null,               -- provider-native slug
  display_name      text not null,
  kind              model_kind not null,
  input_price_m     numeric(10,4),               -- USD per 1M input tokens
  output_price_m    numeric(10,4),               -- USD per 1M output tokens
  price_per_min     numeric(10,5),               -- USD per audio minute
  credit_multiplier numeric(6,2) not null default 1.0,
  is_default        boolean not null default false,
  byok_only         boolean not null default false,
  tier              text not null default 'free',  -- 'free' | 'paid'
  enabled           boolean not null default true,
  notes             text,
  sort_order        int not null default 100,
  price_synced_at   timestamptz,
  unique (provider, model_id)
);

alter table profiles
  add constraint fk_chat_model      foreign key (chat_model_id)      references ai_models(id),
  add constraint fk_transcribe_model foreign key (transcribe_model_id) references ai_models(id);

-- ai_models is world-readable (it's a public price list), nobody can write it
alter table ai_models enable row level security;
create policy "read models" on ai_models for select to authenticated using (enabled);

-- ============================================================
-- 0005_user_ai_keys.sql
-- ============================================================
create table user_ai_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  provider      provider_id not null,
  label         text,
  encrypted_key bytea not null,
  key_hint      text not null,               -- last 4 chars only
  base_url      text,                        -- required when provider = 'custom'
  is_active     boolean not null default true,
  last_used_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  unique (user_id, provider, label)
);

-- The client must never be able to read the blob
revoke select (encrypted_key) on user_ai_keys from authenticated;

-- ============================================================
-- 0006_credits.sql
-- ============================================================
create table credit_packages (
  id            text primary key,            -- 'starter_50', 'regular_100', ...
  name          text not null,
  price_egp     int not null,
  base_credits  int not null,
  bonus_pct     int not null default 0,
  total_credits int generated always as
                  (base_credits + (base_credits * bonus_pct / 100)) stored,
  is_featured   boolean not null default false,
  store_product_id_ios     text,
  store_product_id_android text,
  enabled       boolean not null default true,
  sort_order    int not null default 100
);

insert into credit_packages
  (id, name, price_egp, base_credits, bonus_pct, is_featured, sort_order) values
  ('starter_50',  'Starter', 50,   500, 10, false, 10),
  ('regular_100', 'Regular', 100, 1000, 20, true,  20),
  ('pro_250',     'Pro',     250, 2500, 30, false, 30),
  ('max_500',     'Max',     500, 5000, 40, false, 40);

-- Append-only ledger. Never UPDATE or DELETE a row here.
create table credit_ledger (
  id            bigserial primary key,
  user_id       uuid not null references auth.users on delete cascade,
  delta         int not null,                -- negative for usage
  balance_after int not null,
  reason        ledger_reason not null,
  ai_action_id  uuid,
  package_id    text references credit_packages(id),
  payment_ref   text,
  meta          jsonb,
  created_at    timestamptz not null default now()
);
create index on credit_ledger (user_id, created_at desc);

-- In-flight holds, so two concurrent calls can't overspend
create table credit_reservations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  amount       int not null check (amount > 0),
  status       text not null default 'held',   -- held | settled | released
  ai_action_id uuid,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes'
);
create index on credit_reservations (status, expires_at);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  package_id    text not null references credit_packages(id),
  amount_egp    int not null,
  channel       text not null,               -- 'ios_iap' | 'android_iap' | 'paymob'
  external_ref  text not null,
  status        text not null default 'pending',  -- pending | verified | failed | refunded
  raw_receipt   jsonb,
  created_at    timestamptz not null default now(),
  verified_at   timestamptz,
  unique (channel, external_ref)             -- replay protection
);

-- ============================================================
-- 0007_core.sql  (spaces, notes, relationships, recordings, transcripts)
-- ============================================================
create table spaces (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  emoji      text not null default '💡',
  canvas_zoom real not null default 1,
  canvas_x   real not null default 0,
  canvas_y   real not null default 0,
  note_count int not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on spaces (user_id, last_activity_at desc) where deleted_at is null;

create table recordings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  space_id     uuid not null references spaces on delete cascade,
  storage_path text,
  local_only   boolean not null default true,
  duration_ms  int not null,
  size_bytes   int,
  mime_type    text not null default 'audio/m4a',
  status       recording_status not null default 'recorded',
  error        text,
  created_at   timestamptz not null default now()
);
create index on recordings (space_id, created_at desc);

create table transcripts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  recording_id uuid not null references recordings on delete cascade,
  text         text not null,
  language     text,
  provider     provider_id not null,
  model_id     text not null,
  created_at   timestamptz not null default now()
);
create index on transcripts (recording_id);

create table sticky_notes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  space_id        uuid not null references spaces on delete cascade,
  title           text,
  content         text not null,
  type            note_type not null default 'idea',
  color           text,
  x               real not null,
  y               real not null,
  width           real not null default 180,
  height          real not null default 120,
  parent_id       uuid references sticky_notes on delete set null,
  z_index         int not null default 0,
  source_type     source_type not null default 'manual',
  recording_id    uuid references recordings on delete set null,
  transcript_id   uuid references transcripts on delete set null,
  span_start      int,                      -- char offsets into transcript.text
  span_end        int,
  ai_action_id    uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on sticky_notes (space_id) where deleted_at is null;
create index on sticky_notes (space_id, x, y);
create index on sticky_notes (parent_id);
create index on sticky_notes (recording_id);

create table relationships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  space_id     uuid not null references spaces on delete cascade,
  from_note_id uuid not null references sticky_notes on delete cascade,
  to_note_id   uuid not null references sticky_notes on delete cascade,
  type         rel_type not null default 'related',
  created_by   text not null default 'user',
  ai_action_id uuid,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint no_self_link check (from_note_id <> to_note_id)
);
create unique index rel_unique on relationships (from_note_id, to_note_id, type)
  where deleted_at is null;

-- ============================================================
-- 0008_ai_actions.sql
-- ============================================================
create table ai_actions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  space_id       uuid not null references spaces on delete cascade,
  kind           ai_action_kind not null,
  status         ai_action_status not null default 'pending',
  recording_id   uuid references recordings on delete set null,
  transcript_id  uuid references transcripts on delete set null,
  provider       provider_id not null,
  model_id       text not null,
  prompt_version text not null,
  billed_to      text not null default 'credits',  -- 'credits' | 'byok'
  credits_charged int not null default 0,
  input_tokens   int,
  output_tokens  int,
  raw_cost_usd   numeric(10,6),
  raw_response   jsonb,
  error          text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index on ai_actions (space_id, created_at desc);
create index on ai_actions (user_id, created_at desc);

-- One reversible mutation. Undo replays inverse_patch in reverse sort_order.
create table ai_action_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  ai_action_id  uuid not null references ai_actions on delete cascade,
  operation     text not null,     -- create_note | update_note | create_relationship
  target_type   text not null,     -- note | relationship
  target_id     uuid,
  forward_patch jsonb not null,
  inverse_patch jsonb not null,
  accepted      boolean not null default true,
  applied_at    timestamptz,
  sort_order    int not null default 0
);
create index on ai_action_items (ai_action_id, sort_order);

-- ============================================================
-- 0009_timeline.sql
-- ============================================================
create table timeline_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  space_id   uuid not null references spaces on delete cascade,
  type       text not null,
  ref_id     uuid,
  summary    text not null,
  created_at timestamptz not null default now()
);
create index on timeline_events (space_id, created_at desc);

-- Timeline written by the database so it can never be forgotten.
create or replace function on_note_change() returns trigger
language plpgsql security definer as $$
declare v_type text; v_summary text;
begin
  if TG_OP = 'INSERT' then
    v_type := 'note_created';
    update spaces set note_count = note_count + 1, last_activity_at = now()
      where id = new.space_id;
  elsif TG_OP = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      v_type := 'note_deleted';
      update spaces set note_count = greatest(note_count - 1, 0) where id = new.space_id;
    elsif old.content is distinct from new.content or old.type is distinct from new.type then
      v_type := 'note_updated';
    else
      return new;                        -- position-only change: no timeline noise
    end if;
    update spaces set last_activity_at = now() where id = new.space_id;
  end if;

  v_summary := coalesce(new.title, left(new.content, 60));
  insert into timeline_events (user_id, space_id, type, ref_id, summary)
  values (new.user_id, new.space_id, v_type, new.id, v_summary);
  return new;
end $$;

create trigger t_note_timeline after insert or update on sticky_notes
  for each row execute function on_note_change();

create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger t_notes_touch before update on sticky_notes
  for each row execute function touch_updated_at();
create trigger t_spaces_touch before update on spaces
  for each row execute function touch_updated_at();
```

---

## 9. Row Level Security

```sql
-- 0010_rls.sql
alter table profiles            enable row level security;
alter table spaces              enable row level security;
alter table recordings          enable row level security;
alter table transcripts         enable row level security;
alter table sticky_notes        enable row level security;
alter table relationships       enable row level security;
alter table ai_actions          enable row level security;
alter table ai_action_items     enable row level security;
alter table timeline_events     enable row level security;
alter table user_ai_keys        enable row level security;
alter table credit_ledger       enable row level security;
alter table credit_reservations enable row level security;
alter table payments            enable row level security;
alter table credit_packages     enable row level security;

-- Full ownership on user data
create policy "own" on spaces        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on recordings    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on transcripts   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on sticky_notes  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on relationships for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on ai_actions    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on ai_action_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on timeline_events for select using (auth.uid() = user_id);
create policy "own" on user_ai_keys  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Money tables: READ ONLY from the client. Writes happen via SECURITY DEFINER RPCs only.
create policy "read own" on profiles            for select using (auth.uid() = id);
create policy "update own prefs" on profiles    for update using (auth.uid() = id)
  with check (auth.uid() = id);
create policy "read own" on credit_ledger       for select using (auth.uid() = user_id);
create policy "read own" on credit_reservations for select using (auth.uid() = user_id);
create policy "read own" on payments            for select using (auth.uid() = user_id);
create policy "read all" on credit_packages     for select using (enabled);

-- Block direct credit tampering even though the column sits on a user-updatable row
create or replace function guard_profile_update() returns trigger
language plpgsql as $$
begin
  if new.credits_balance  is distinct from old.credits_balance
  or new.credits_reserved is distinct from old.credits_reserved then
    raise exception 'credits are read-only from the client';
  end if;
  return new;
end $$;

create trigger t_guard_profile before update on profiles
  for each row when (current_setting('role') = 'authenticated')
  execute function guard_profile_update();
```

### CI test — do not skip this

```sql
-- Fails the build if any public table ships without RLS
select tablename from pg_tables
 where schemaname = 'public'
   and tablename not in (
     select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relrowsecurity
   );
-- must return zero rows
```

The anon key is inside every installed app. One table without RLS is a full data
leak, including the credit ledger.

---

## 10. Credit RPCs — Reserve & Settle

Never `update profiles set credits_balance = ...` from application code. All
credit movement goes through these three functions, which lock the row.

```sql
-- 0011_credit_rpcs.sql

-- Called BEFORE the provider request. Returns reservation id, or raises.
create or replace function reserve_credits(p_amount int, p_reason text default 'usage')
returns uuid
language plpgsql security definer as $$
declare v_user uuid := auth.uid(); v_avail int; v_res uuid;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  select credits_balance - credits_reserved into v_avail
    from profiles where id = v_user for update;

  if v_avail < p_amount then
    raise exception 'INSUFFICIENT_CREDITS: need %, available %', p_amount, v_avail
      using errcode = 'P0001';
  end if;

  update profiles set credits_reserved = credits_reserved + p_amount where id = v_user;

  insert into credit_reservations (user_id, amount) values (v_user, p_amount)
    returning id into v_res;
  return v_res;
end $$;

-- Called AFTER the provider responds, with the true amount.
create or replace function settle_credits(
  p_reservation uuid, p_actual int, p_ai_action uuid
) returns int
language plpgsql security definer as $$
declare v_user uuid; v_held int; v_bal int;
begin
  select user_id, amount into v_user, v_held
    from credit_reservations where id = p_reservation and status = 'held' for update;
  if v_user is null then raise exception 'reservation not found or already settled'; end if;
  if p_actual < 0 then raise exception 'actual must be >= 0'; end if;

  update profiles
     set credits_reserved = credits_reserved - v_held,
         credits_balance  = credits_balance  - p_actual
   where id = v_user
   returning credits_balance into v_bal;

  update credit_reservations
     set status = 'settled', ai_action_id = p_ai_action where id = p_reservation;

  if p_actual > 0 then
    insert into credit_ledger (user_id, delta, balance_after, reason, ai_action_id)
    values (v_user, -p_actual, v_bal, 'usage', p_ai_action);
  end if;
  return v_bal;
end $$;

-- Called when the provider call fails. Charges nothing.
create or replace function release_credits(p_reservation uuid)
returns void
language plpgsql security definer as $$
declare v_user uuid; v_held int;
begin
  select user_id, amount into v_user, v_held
    from credit_reservations where id = p_reservation and status = 'held' for update;
  if v_user is null then return; end if;

  update profiles set credits_reserved = credits_reserved - v_held where id = v_user;
  update credit_reservations set status = 'released' where id = p_reservation;
end $$;

-- Credit grant after a VERIFIED payment. Service role only.
create or replace function grant_credits(
  p_user uuid, p_amount int, p_reason ledger_reason,
  p_package text default null, p_payment_ref text default null
) returns int
language plpgsql security definer as $$
declare v_bal int;
begin
  update profiles set credits_balance = credits_balance + p_amount
   where id = p_user returning credits_balance into v_bal;

  insert into credit_ledger (user_id, delta, balance_after, reason, package_id, payment_ref)
  values (p_user, p_amount, v_bal, p_reason, p_package, p_payment_ref);
  return v_bal;
end $$;

revoke execute on function grant_credits from authenticated, anon;

-- Monthly free top-up: reset to 100, never accumulate
create or replace function monthly_free_refill() returns void
language sql security definer as $$
  with bumped as (
    update profiles
       set credits_balance = greatest(credits_balance, 100),
           free_refill_at  = current_date
     where (free_refill_at is null or free_refill_at < date_trunc('month', current_date))
       and credits_balance < 100
    returning id, credits_balance
  )
  insert into credit_ledger (user_id, delta, balance_after, reason)
  select id, 0, credits_balance, 'monthly_refill' from bumped;
$$;

select cron.schedule('free-refill', '0 2 1 * *', $$ select monthly_free_refill(); $$);

-- Sweep abandoned reservations hourly
select cron.schedule('release-stale-reservations', '5 * * * *', $$
  update credit_reservations set status = 'released'
   where status = 'held' and expires_at < now();
  update profiles p set credits_reserved = coalesce((
    select sum(amount) from credit_reservations r
     where r.user_id = p.id and r.status = 'held'), 0);
$$);
```

### Call sequence in every AI Edge Function

```
1. auth.getUser()                        → reject if null
2. resolve model from ai_models
3. resolve key: user_ai_keys → else platform key → else NEEDS_OWN_KEY
4. if platform key:  estimate = base_credits × multiplier
                     reservation = reserve_credits(estimate)
5. call provider
6a. success → actual = recompute from real usage
              settle_credits(reservation, actual, aiActionId)
6b. failure → release_credits(reservation)  ← user pays nothing for our errors
7. write ai_actions row with credits_charged + raw_cost_usd
```

**Never charge for a failed call.** One charged failure costs more in trust than
a hundred free retries cost in credits.

---

## 11. Edge Functions

```
supabase/functions/
  _shared/
    auth.ts          getUserOrThrow(req)
    credits.ts       reserve / settle / release wrappers
    models.ts        resolveModel(kind, userId) → row from ai_models
    keys.ts          resolveApiKey(userId, provider) → {key, source}
    crypto.ts        sealKey / openKey (AES-256-GCM)
    providers/       openrouter · openai · google · anthropic · nvidia · custom
    prompts/         extract-thoughts.ts (versioned)
    schemas.ts       Zod schemas
    context.ts       buildSpaceContext(spaceId, maxTokens)
    layout.ts        arrange(notes, relationships) → x/y
  transcribe/        audio → transcripts row
  ai-extract/        transcript → proposed notes
  models-sync/       nightly: refresh prices + multipliers from OpenRouter
  verify-purchase/   IAP receipt / Paymob callback → grant_credits
  byok-save/         validate + encrypt + store a user key
```

### `transcribe`

```ts
Deno.serve(async (req) => {
  const user = await getUserOrThrow(req);
  const { recordingId } = await req.json();

  const rec = await db.recordings.get(recordingId);           // via user JWT → RLS
  const minutes = Math.ceil(rec.duration_ms / 60000);

  const model = await resolveModel('transcribe', user.id);
  const { key, source } = await resolveApiKey(user.id, model.provider);

  const cost = Math.ceil(6 * minutes * model.credit_multiplier);
  const reservation = source === 'platform' ? await reserveCredits(cost) : null;

  try {
    await db.recordings.update(recordingId, { status: 'transcribing' });
    const signed = await storage.createSignedUrl(rec.storage_path, 300);
    const result = await getTranscribeProvider(model.provider)
      .transcribe({ audioUrl: signed, modelId: model.model_id, apiKey: key });

    const transcript = await db.transcripts.insert({
      recording_id: recordingId, text: result.text, language: result.language,
      provider: model.provider, model_id: model.model_id,
    });
    await db.recordings.update(recordingId, { status: 'transcribed' });

    if (reservation) await settleCredits(reservation, cost, null);
    // Free plan: delete audio from Storage, keep the local copy on device
    if (await isFreePlan(user.id)) await storage.remove(rec.storage_path);

    return Response.json({ transcriptId: transcript.id, text: result.text,
                           creditsCharged: reservation ? cost : 0 });
  } catch (e) {
    if (reservation) await releaseCredits(reservation);
    await db.recordings.update(recordingId, { status: 'failed', error: String(e) });
    return Response.json({ error: 'TRANSCRIBE_FAILED' }, { status: 502 });
  }
});
```

### `ai-extract`

Same shape, plus:

```ts
const context = await buildSpaceContext(supabase, spaceId, { maxTokens: 2000 });
const prompt  = extractThoughtsPrompt;

const result = await getChatProvider(model.provider).chat({
  modelId: model.model_id,
  system: prompt.system,
  user: prompt.buildUser({ context, transcript: transcript.text }),
  temperature: 0.3, maxTokens: 1500, jsonMode: true,
  apiKey: key, baseUrl: model.provider === 'custom' ? userKey.base_url : undefined,
});

// Validate — one repair attempt, then fail loudly. Never write unvalidated output.
let parsed = ExtractThoughtsSchema.safeParse(safeJson(result.text));
if (!parsed.success) {
  const repaired = await provider.chat({ ...same, user: repairPrompt(result.text, parsed.error) });
  parsed = ExtractThoughtsSchema.safeParse(safeJson(repaired.text));
  if (!parsed.success) { await releaseCredits(reservation); return err('AI_SCHEMA_FAILED'); }
}

// Server computes positions so the client just animates them in
const positioned = layout.arrange(parsed.data.notes, parsed.data.relationships);

// Persist as a PROPOSAL — nothing applied until the user accepts
const action = await db.ai_actions.insert({ status: 'proposed', ... });
await db.ai_action_items.insertMany(buildItems(positioned, action.id));

// Recompute actual credits from real token usage
const actualCost = Math.ceil(2 * model.credit_multiplier);
await settleCredits(reservation, actualCost, action.id);
```

### `models-sync` (nightly, `pg_cron` at 03:00)

```
GET https://openrouter.ai/api/v1/models
→ for each enabled ai_models row with provider='openrouter':
     update input_price_m, output_price_m
     recompute credit_multiplier = max(1, round((2.4*in + 0.9*out) / 0.225, 1))
     set price_synced_at = now()
→ if any multiplier moved more than 25%, write an admin alert row
```

Prices rise. Without this job your margins quietly erode and you find out from
your OpenRouter invoice.

### `verify-purchase`

```
1. Receive { channel, receipt, packageId }
2. Verify server-side:
   ios_iap     → Apple verifyReceipt / App Store Server API
   android_iap → Google Play Developer API purchases.products.get
   paymob      → HMAC signature check on the callback payload
3. Insert into payments (unique on channel+external_ref → replay-safe)
4. On first successful insert only: grant_credits(user, package.total_credits,
   'purchase', packageId, external_ref)
5. Never trust a client-reported purchase. Never grant from the client.
```

---

## 12. Prompts & Schemas

```ts
// _shared/schemas.ts
export const ExtractedNote = z.object({
  tempId: z.string(),
  type: z.enum(['idea','task','question','decision','reference','thought','summary']),
  title: z.string().min(1).max(80),
  content: z.string().min(1).max(400),
  parentTempId: z.string().optional(),
  spanStart: z.number().int().nonnegative().optional(),
  spanEnd: z.number().int().nonnegative().optional(),
  matchesExistingNoteId: z.string().uuid().optional(),
});

export const ExtractThoughtsSchema = z.object({
  summary: z.string().max(200),
  notes: z.array(ExtractedNote).min(1).max(8),        // hard cap enforced here
  relationships: z.array(z.object({
    fromTempId: z.string(), toTempId: z.string(),
    type: z.enum(['related','depends_on','supports','contradicts','derived_from','child_of']),
  })).max(16),
}).refine(
  d => d.notes.some(n => n.parentTempId),             // reject flat output
  { message: 'output must contain at least one parent/child relationship' }
);
```

```ts
// _shared/prompts/extract-thoughts.ts
export const extractThoughtsPrompt = {
  id: 'extract-thoughts',
  version: '1.0.0',
  system: `You turn a person's spoken thinking into a small, structured map of ideas.

RULES — these are hard constraints, not preferences:
1. Produce 3 to 6 notes. Never more than 6 for one minute of speech.
2. NEVER create one note per sentence. Group related sentences into one idea.
3. At least one note must be a parent with children (parentTempId). Flat output is a failure.
4. Use the speaker's own vocabulary. Do not rewrite their thinking into corporate language.
5. If a thought matches an existing note in CONTEXT, set matchesExistingNoteId
   instead of creating a near-duplicate.
6. Set spanStart/spanEnd to the character offsets in the transcript this note came from.
7. Uncertain? Produce FEWER notes, not more.
8. Output ONLY valid JSON matching the schema. No markdown fences, no commentary.

TYPES: idea (a direction) · task (an action) · question (unresolved) ·
decision (a choice made) · reference (external fact) · thought (raw observation) ·
summary (rolls up children)`,

  buildUser: ({ context, transcript }: { context: string; transcript: string }) =>
`CONTEXT — existing notes in this space:
${context || '(this space is empty)'}

TRANSCRIPT:
${transcript}

Return JSON only.`,
};
```

**Before writing any app code**, run this prompt against 10 real 45-second
transcripts. If it produces flat or generic output, fix the prompt. 90% of this
product's perceived value lives in this one file.

---

## 13. Client Architecture

### State ownership — three layers, do not blur them

| Layer | Holds | Tool |
| --- | --- | --- |
| Per-frame | pan / zoom / drag values | Reanimated `useSharedValue` — **zero React renders** |
| Interaction | selection, dragging id, recording state, sheets | Zustand |
| Persistent | spaces, notes, credits, models | TanStack Query over Supabase |

`StickyNoteItem` receives **only an id** and subscribes to its own row via a
narrowed `select`. Dragging note A must not re-render note B. This is the single
most important performance rule in the app.

### Folders

```
src/
  app/                    # Expo Router
    _layout.tsx
    index.tsx             # Home
    space/[id]/
      index.tsx           # Canvas
      note/[noteId].tsx
      ai-review.tsx
    credits/
      index.tsx           # balance + history
      buy.tsx             # packages
    settings/
      models.tsx          # model picker (Phase B)
      keys.tsx            # BYOK (Phase C)
  features/
    spaces/ canvas/ sticky-notes/ voice/ ai/ credits/ timeline/
      { components, hooks, api, types }
  shared/  { components, hooks, utils, constants, types }
  lib/
    supabase/ { client.ts, database.types.ts, storage.ts }
    query-client/
  providers/
```

### Supabase client

```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage: AsyncStorage, autoRefreshToken: true,
            persistSession: true, detectSessionInUrl: false } }
);
```

Only these two env vars go in the app. The anon key is public by design; RLS is
what protects data.

### Auth

`signInAnonymously()` on first launch — no signup screen, user is recording
within 3 seconds, and RLS still works. Offer email linking via
`updateUser({ email })` after their third recording, on the same user id, with
no data migration.

### Audio

```ts
// Record with expo-audio → local file first, always
const uri = FileSystem.documentDirectory + `recordings/${id}.m4a`;

// Upload needs ArrayBuffer. FormData with a file URI uploads 0 bytes in RN.
import { decode } from 'base64-arraybuffer';
const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
await supabase.storage.from('recordings')
  .upload(`${userId}/${spaceId}/${id}.m4a`, decode(b64), { contentType: 'audio/m4a' });
```

Playback always prefers the local file. Storage is transport, not truth.

### Canvas

- World coords; `screen = (world + offset) * scale`; scale clamped 0.25–3.0
- One `Animated.View` carries the whole canvas transform
- Connections drawn in a single Skia canvas, not N React views
- Below 0.5 scale: drop shadows and body text (LOD)
- Viewport culling above 150 notes, skipped below
- Gestures: pan+pinch simultaneous · note drag blocks canvas pan · tap requires
  double-tap to fail · long-press background creates a note
- Drag-end writes debounced 250ms and batched into one `bulk_move_notes` RPC

### Dependencies

```bash
npx create-expo-app@latest mindspace --template expo-template-blank-typescript

npx expo install expo-router react-native-safe-area-context react-native-screens \
  react-native-gesture-handler react-native-reanimated expo-audio expo-file-system \
  expo-secure-store expo-haptics expo-image expo-notifications \
  @shopify/react-native-skia @react-native-async-storage/async-storage \
  expo-in-app-purchases

npm i @supabase/supabase-js react-native-url-polyfill base64-arraybuffer \
  @tanstack/react-query @tanstack/react-query-persist-client \
  @tanstack/query-async-storage-persister zustand nativewind @gorhom/bottom-sheet

npm i -D supabase tailwindcss jest-expo @testing-library/react-native
```

---

## 14. Screens

### Home
Greeting · large mic button · space list · credit chip in the header showing
balance and minutes remaining.

### Canvas
Canvas fills the screen. Floating mic bottom-centre, `+` and `✨` beside it.
Header: space name, credit balance, overflow menu.

### Recording
Full-screen, near-black. Elapsed time, live waveform, stop button.
**No live transcript** — seeing text while talking makes people edit instead of think.

### AI Review sheet
```
┌──────────────────────────────┐
│  ✨ Found 5 notes            │
│  Cost: 8 credits             │
│                              │
│  ☑ 🟨 Voice-first capture    │
│  ☑ 🟦   └ AI organization    │
│  ☑ 🟧   └ Indie hackers      │
│  ☑ 🟩 Design recording flow  │
│  ☑ 🟪 Web or mobile first?   │
│                              │
│  [ Accept ]     [ Reject ]   │
└──────────────────────────────┘
```
Per-item checkboxes. Accept applies only checked items in one transaction, then
a toast: `AI added 5 notes  [Undo]`.

### Note detail
Title · content (editable) · `🎙 Original thought` with a player · transcript
with the source span highlighted · type and colour pickers · delete.

### Credits
Balance card · package grid · ledger history (date, action, credits, running
balance).

### Settings → Models (Phase B) and Keys (Phase C)
As specified in §6 and §7.

---

## 15. Payments — Critical Constraint

**Read this before designing the purchase flow.**

Apple and Google both require their own billing systems for digital goods sold
inside a mobile app. Credits are digital goods. Selling them through Paymob or
Fawry inside the app will get the app rejected or removed.

| Channel | Fee | Notes |
| --- | --- | --- |
| iOS IAP (consumable) | 30%, or **15%** under the Small Business Program | Enroll in SBP immediately — it's an application, not automatic |
| Google Play Billing | 30%, or **15%** on first $1M/year | Same |
| Paymob / Fawry (web only) | ~2.5–3% | Only outside the app |

### What this does to your margins

At a 30% store fee, the Max 500 package returns 350 EGP against 238 EGP of AI
cost — a 32% margin. At 15% it becomes 47%. **The Small Business Program is not
optional for this business model.**

### Recommended structure

1. Ship IAP consumables on both stores, one product per package.
2. Also sell the same packages on a simple web page via **Paymob** (Egypt-native,
   supports Meeza, Fawry, wallets, instaPay). Credits are on the account, so a
   web purchase appears in the app instantly.
3. Do not link to the web store from inside the iOS app.
4. Verify every receipt server-side in `verify-purchase`. The `unique(channel,
   external_ref)` constraint on `payments` prevents replay.

### Also plan for

- Apple/Google price tiers are fixed ladders — your exact 50/100/250/500 EGP
  points may not exist. Pick the nearest tier and adjust `base_credits` so the
  credits-per-EGP ratio stays consistent.
- Egyptian cards frequently fail on foreign gateways. Paymob is the reliable
  local path and should be the default web option.

---

## 16. Build Order

Each stage ends green: `tsc --noEmit`, ESLint, tests, RLS check, physical device test.

| # | Stage | Days | Output |
| --- | --- | --- | --- |
| **0** | **Prompt validation** | 3 | 10 transcripts through `extract-thoughts`. 3–6 notes, hierarchy present, recognizable. **No app code until this passes.** |
| **1** | Supabase foundation | 4 | All migrations, RLS + CI check, anon auth, typed client, seed `ai_models` + `credit_packages` |
| **2** | Credits core | 3 | reserve/settle/release RPCs, balance UI, ledger screen, free-tier grant, refill cron |
| **3** | Capture | 5 | Record → local file → upload → `transcribe` fn → transcript on screen, credits deducted |
| **4** | Canvas | 8 | Pan/pinch/drag, sticky notes CRUD, manual creation, LOD, culling, batched moves |
| **5** | **Extraction — the core** | 8 | `ai-extract`, server-side layout, review sheet, apply transaction, undo, staggered animation |
| **6** | Provenance | 4 | Note detail, audio playback, span highlight, editable interpretation |
| **7** | **Ship to 20 testers** | — | TestFlight + internal track. Watch. Fix. Add nothing. |
| **8** | Payments | 5 | IAP products, `verify-purchase`, Paymob web page, purchase flow |
| **9** | Model picker (Phase B) | 3 | Settings screen, per-task selection, credit cost shown per model, `models-sync` cron |
| **10** | BYOK (Phase C) | 4 | `byok-save`, AES-GCM vault, key validation, 0-credit routing, Gemini + OpenAI + Anthropic adapters |
| **11** | Polish | 4 | Onboarding, empty states, email linking, timeline screen, design pass |

**≈ 51 working days ≈ 10–11 weeks solo.**

Stages 9 and 10 come **after** shipping deliberately. A model picker on a product
nobody has validated is a settings screen for an empty app.

---

## 17. Acceptance Criteria

### The product works when a new user can, in 90 seconds, unaided:

- [ ] Open the app and start recording without signing up
- [ ] Talk for 40 seconds
- [ ] See a transcript they recognize as what they said
- [ ] See 3–6 notes appear with visible parent/child structure
- [ ] Say "that's actually what I meant" — not "close enough"
- [ ] Drag a note; it stays where they put it after an app restart
- [ ] Open a note and hear their own voice from it
- [ ] Edit the AI's wording and have it persist
- [ ] See their credit balance drop by exactly 8, with the reason in the ledger

### The system is correct when:

- [ ] Every public table returns `rowsecurity = true` in the CI check
- [ ] A second user's JWT returns zero rows from every table
- [ ] `encrypted_key` is unreadable via PostgREST with a user JWT
- [ ] A failed provider call charges **0 credits** and leaves balance unchanged
- [ ] Two concurrent extractions cannot push the balance below 0
- [ ] A replayed IAP receipt grants credits exactly once
- [ ] Canvas holds 60fps with 300 notes on a mid-range Android device
- [ ] Dragging one note triggers zero re-renders of other notes (verify with the profiler)
- [ ] Extraction never returns more than 6 notes for 60 seconds of audio
- [ ] `credits_charged` on every `ai_actions` row reconciles against the ledger
- [ ] No API key appears in `npx expo export` output

---

## 18. Config Reference

### Edge Function secrets (`supabase secrets set`)

```
PLATFORM_OPENROUTER_KEY   = sk-or-v1-...       # the only funded provider key
BYOK_MASTER_KEY           = <base64 32 bytes>  # AES-256-GCM master key
FX_EGP_PER_USD            = 50
FX_BUFFER                 = 1.15
FREE_TIER_CREDITS         = 100
FREE_MAX_RECORDING_SEC    = 180
APPLE_SHARED_SECRET       = ...
GOOGLE_SERVICE_ACCOUNT    = <json>
PAYMOB_HMAC_SECRET        = ...
```

### App env (`.env`, safe to ship)

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

**Nothing else goes in the app.** Anything prefixed `EXPO_PUBLIC_` is readable
by anyone who downloads the build.

### Constants that must live in the DB, not in code

Model IDs · model prices · credit multipliers · package prices and bonuses ·
base action credits. All of these change without a release. All of them belong
in `ai_models` and `credit_packages`.

---

## The Ten Rules

1. **Validate the extraction prompt before writing app code.** It is 90% of the product.
2. **RLS on every table**, with both `using` and `with check`, verified in CI.
3. **Credits move only through `reserve` → `settle` / `release` RPCs.** Never a direct UPDATE.
4. **Failed AI calls charge nothing.**
5. **Model IDs and prices live in the database.** Adding a model is an INSERT.
6. **Only OpenRouter is platform-funded.** Everything else is BYOK.
7. **BYOK calls cost 0 credits** — that's the whole reason technical users stay.
8. **Never lose the original recording.** Local file first, always.
9. **Max 6 notes per minute of speech**, enforced in both prompt and schema.
10. **Enroll in Apple's Small Business Program before launch** — 15% vs 30% is the
    difference between a 47% and a 32% margin.