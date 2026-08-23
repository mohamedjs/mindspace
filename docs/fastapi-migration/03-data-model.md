# 03 — Data model translation

Every column below was read from `supabase/migrations/`. Column names **do not
change** — the frontend's `mappers.ts` already maps these exact names, and the
data migration is a straight `COPY`.

## Conventions

- `app/core/base.py`:
  ```python
  from sqlalchemy.orm import DeclarativeBase
  from sqlalchemy import MetaData

  NAMING = {
      "ix": "ix_%(table_name)s_%(column_0_N_name)s",
      "uq": "uq_%(table_name)s_%(column_0_N_name)s",
      "ck": "ck_%(table_name)s_%(constraint_name)s",
      "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
      "pk": "pk_%(table_name)s",
  }
  class Base(DeclarativeBase):
      metadata = MetaData(naming_convention=NAMING)
  ```
  Give the indexes from [01 §2.4](01-current-surface.md#24-indexes) explicit
  names in the baseline so the naming convention does not rename production
  indexes out from under you.
- Timestamps: `Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())`.
- UUID PKs: `Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())`.
- `real` columns → `sqlalchemy.Float(precision=24)` → Postgres `real`. **Use
  `REAL`, not `double precision`** — `sticky_notes.x/y/width/height` are `real`
  today and the layout code compares them.
- `numeric(p,s)` → `Numeric(p, s)`; read into `Decimal`, and cast with
  `float()`/`Decimal` explicitly where the TS did `Number(...)`.
- Every enum: `sqlalchemy.Enum(PyEnum, name="<pg type name>", native_enum=True, values_callable=lambda e: [m.value for m in e])`.

---

## A. `auth.users` → `users` {#auth-users}

> **Where these live:** `User`, `Profile`, `RefreshToken` and `PasswordResetToken`
> are declared in **`app/core/models.py`**, not in `app/modules/auth/`, because
> `credits` also writes `profiles` and must not gain a dependency on another
> module. See [02](02-target-architecture.md#the-profiles-table-is-shared-between-auth-and-credits--so-its-model-lives-in-core).

The single most important translation. Supabase's `auth.users` lives in a schema
FastAPI will not have. Create an owned table in `public`.

```python
class User(Base):
    __tablename__ = "users"

    id:            Mapped[UUID]           = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    email:         Mapped[str | None]     = mapped_column(Text, unique=True, index=True)
    encrypted_password: Mapped[str | None]= mapped_column(Text)          # bcrypt, from GoTrue
    email_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_anonymous:  Mapped[bool]           = mapped_column(Boolean, nullable=False, server_default=text("false"))
    raw_user_meta_data: Mapped[dict]      = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at:    Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:    Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_sign_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

Notes that matter:

- **`id` has no default.** IDs are preserved verbatim from `auth.users`, and new
  registrations generate `uuid4()` in `AuthService.register()`. Every other
  table's `user_id` FK points here, so a changed ID would orphan the entire
  dataset. The data migration copies `auth.users.id` straight across.
- `raw_user_meta_data` is where GoTrue put `full_name` — see
  `apps/*/src/infrastructure/supabase/platform.ts::toSession`
  (`raw.user.user_metadata?.full_name`) and
  `repositories.ts::supabaseAccountRepository.getProfile`
  (`auth.user.user_metadata?.full_name`). Keep the column and keep populating it
  from `SignUpRequest.full_name`, so `AccountRepository.getProfile`'s fallback
  chain (`profiles.display_name || user_metadata.full_name || null`) still works.
- `is_anonymous` is read by `handle_new_user()`. Anonymous sign-in is **off**
  (`0016_email_auth_notes.sql`: "Leave OFF. AuthProvider no longer calls
  signInAnonymously()"), so new users always get `false`. Keep the column
  because `profiles.is_anonymous` mirrors it and existing rows carry values.
- Every FK that said `references auth.users on delete cascade` becomes
  `ForeignKey("users.id", ondelete="CASCADE")`.

### Refresh tokens

GoTrue kept its own refresh-token store. Add one:

```python
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id:         Mapped[UUID]      = mapped_column(PgUUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id:    Mapped[UUID]      = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str]       = mapped_column(Text, nullable=False, unique=True)   # sha256 of the opaque token
    expires_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
```

Refresh tokens are **not** JWTs — they are 32 random bytes, base64url, stored
hashed. Rotate on every use (issue a new one, revoke the old). Existing Supabase
refresh tokens are **not** migrated: users' sessions survive only as long as
their current Supabase access token, then they sign in again. Say so in the
release notes.

### Password reset tokens

```python
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id:         Mapped[UUID]     = mapped_column(PgUUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id:    Mapped[UUID]     = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str]      = mapped_column(Text, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at:    Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

`AuthPort.resetPassword(email)` must keep returning success regardless of
whether the email exists (no account enumeration). Email delivery is an open
question — see [11 §Q2](11-risks-open-questions.md#q2).

---

## B. Table-by-table

### `profiles` → `app/core/models.py::Profile`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, FK `users.id ON DELETE CASCADE` | Same value as `users.id` |
| `display_name` | `text` null | |
| `is_anonymous` | `boolean` NOT NULL default `true` | |
| `credits_balance` | `int` NOT NULL default `0`, CHECK `>= 0` | **`credits` module writes only** |
| `credits_reserved` | `int` NOT NULL default `0`, CHECK `>= 0` | **`credits` module writes only** |
| `free_refill_at` | `date` null | Monthly refill watermark |
| `chat_model_id` | `uuid` null, FK `ai_models.id` | |
| `transcribe_model_id` | `uuid` null, FK `ai_models.id` | |
| `timezone` | `text` NOT NULL default `'Africa/Cairo'` | Read by `ai-extract`'s `buildClock` |
| `locale` | `text` NOT NULL default `'en'` | Never read anywhere today |
| `created_at` | `timestamptz` NOT NULL default `now()` | |

Constraints `credits_non_negative`, `reserved_non_negative` stay.
The FKs `fk_chat_model` / `fk_transcribe_model` (added in `0004`) stay — they
create a circular table dependency (`profiles ↔ ai_models`), so in the Alembic
baseline create both tables first and add these two FKs with `op.create_foreign_key`
afterwards.

### `ai_models` → `app/modules/ai/models.py::AiModel`

| Column | Type |
|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` |
| `provider` | `provider_id` NOT NULL |
| `model_id` | `text` NOT NULL |
| `display_name` | `text` NOT NULL |
| `kind` | `model_kind` NOT NULL |
| `input_price_m` | `numeric(10,4)` null |
| `output_price_m` | `numeric(10,4)` null |
| `price_per_min` | `numeric(10,5)` null |
| `credit_multiplier` | `numeric(6,2)` NOT NULL default `1.0` |
| `is_default` | `boolean` NOT NULL default `false` |
| `byok_only` | `boolean` NOT NULL default `false` |
| `tier` | `text` NOT NULL default `'free'` |
| `enabled` | `boolean` NOT NULL default `true` |
| `notes` | `text` null |
| `sort_order` | `int` NOT NULL default `100` |
| `price_synced_at` | `timestamptz` null |

UNIQUE `(provider, model_id, kind)` — `0019` widened it from `(provider, model_id)`.

### `user_ai_keys` → `app/modules/byok/models.py::UserAiKey`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL FK `users.id` CASCADE | Default was `auth.uid()` — drop the default, set it in Python |
| `provider` | `provider_id` NOT NULL | |
| `label` | `text` null | Part of the unique key, so `NULL` labels do **not** conflict in Postgres — the `upsert … onConflict: 'user_id,provider,label'` in `byok-save` therefore inserts a new row every time `label` is null. Preserve the current behaviour; note it in [11 §Q5](11-risks-open-questions.md#q5) |
| `encrypted_key` | `bytea` NOT NULL | `iv(12) ‖ AES-GCM ciphertext`. **Never in a response model** |
| `key_hint` | `text` NOT NULL | `…` + last 4 chars |
| `base_url` | `text` null | Overrides `PROVIDER_BASE_URL` |
| `is_active` | `boolean` NOT NULL default `true` | |
| `last_used_at` | `timestamptz` null | Never written today |
| `last_error` | `text` null | Cleared on save |
| `created_at` | `timestamptz` NOT NULL default `now()` | |

UNIQUE `(user_id, provider, label)`.

### `credit_packages` → `app/modules/credits/models.py::CreditPackage`

| Column | Type |
|---|---|
| `id` | `text` PK |
| `name` | `text` NOT NULL |
| `price_egp` | `int` NOT NULL |
| `base_credits` | `int` NOT NULL |
| `bonus_pct` | `int` NOT NULL default `0` |
| `total_credits` | `int` GENERATED ALWAYS AS `(base_credits + base_credits*bonus_pct/100)` STORED |
| `is_featured` | `boolean` NOT NULL default `false` |
| `store_product_id_ios` | `text` null |
| `store_product_id_android` | `text` null |
| `enabled` | `boolean` NOT NULL default `true` |
| `sort_order` | `int` NOT NULL default `100` |

### `credit_ledger` → `app/modules/credits/models.py::CreditLedger`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | `BigInteger, Identity()`; the client's `LedgerEntry.id` is a **number**, not a string |
| `user_id` | `uuid` NOT NULL FK CASCADE | |
| `delta` | `int` NOT NULL | Can be `0` (monthly refill) |
| `balance_after` | `int` NOT NULL | |
| `reason` | `ledger_reason` NOT NULL | |
| `ai_action_id` | `uuid` null | **No FK** in the original. Keep it FK-less; adding one would break the `settle_credits(..., p_ai_action=null)` path and the ordering in `ai-note-write` |
| `package_id` | `text` null FK `credit_packages.id` | |
| `payment_ref` | `text` null | |
| `meta` | `jsonb` null | |
| `created_at` | `timestamptz` NOT NULL default `now()` | |

**Append-only.** `CreditLedgerRepository` exposes `insert` and `list` only — no
`update`, no `delete`. Write that as a comment and as a test.

### `credit_reservations` → `CreditReservation`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `uuid` NOT NULL FK CASCADE |
| `amount` | `int` NOT NULL CHECK `> 0` |
| `status` | `text` NOT NULL default `'held'` — values in practice: `held`, `settled`, `released` |
| `ai_action_id` | `uuid` null |
| `created_at` | `timestamptz` NOT NULL default `now()` |
| `expires_at` | `timestamptz` NOT NULL default `now() + interval '10 minutes'` |

`status` is a plain `text`, not an enum. Leave it text (the data migration
copies raw strings); constrain in Python with a `StrEnum` used at the service
boundary only.

### `payments` → `app/modules/billing/models.py::Payment`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL FK CASCADE | |
| `package_id` | `text` null FK `credit_packages.id` | `NOT NULL` dropped by `0024` |
| `subscription_id` | `uuid` null FK `subscriptions.id` | Added by `0024` |
| `amount_egp` | `int` NOT NULL | |
| `channel` | `text` NOT NULL | **Plain text, not the `payment_channel` enum** — `0006` predates `0024`. Keep it text |
| `external_ref` | `text` NOT NULL | |
| `status` | `text` NOT NULL default `'pending'` | |
| `raw_receipt` | `jsonb` null | |
| `created_at` | `timestamptz` NOT NULL default `now()` | |
| `verified_at` | `timestamptz` null | |

UNIQUE `(channel, external_ref)` — **the payment idempotency guarantee**.
`SubscriptionService.confirm` must catch `IntegrityError` on this constraint and
return `{subscriptionId, status:"active", creditsGranted:0, alreadyActive:true}`,
matching `subscribe-confirm`'s `23505` branch.

### `spaces` → `app/modules/spaces/models.py::Space`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `uuid` NOT NULL FK CASCADE (drop `auth.uid()` default) |
| `name` | `text` NOT NULL |
| `emoji` | `text` NOT NULL default `'💡'` |
| `canvas_zoom` | `real` NOT NULL default `1` |
| `canvas_x` | `real` NOT NULL default `0` |
| `canvas_y` | `real` NOT NULL default `0` |
| `note_count` | `int` NOT NULL default `0` |
| `last_activity_at` | `timestamptz` NOT NULL default `now()` |
| `created_at` / `updated_at` | `timestamptz` NOT NULL default `now()` |
| `deleted_at` | `timestamptz` null |

`canvas_zoom/x/y` are never read or written by either client today (canvas
viewport lives in `features/canvas/store/canvasStore.ts`). Keep the columns.

### `recordings` → `app/modules/recordings/models.py::Recording`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL FK CASCADE | |
| `space_id` | `uuid` NOT NULL FK `spaces.id` CASCADE | |
| `storage_path` | `text` null | Nulled out for free-plan users after transcription |
| `local_only` | `boolean` NOT NULL default `true` | |
| `duration_ms` | `int` NOT NULL | Drives the credit estimate |
| `size_bytes` | `int` null | |
| `mime_type` | `text` NOT NULL default `'audio/m4a'` | |
| `status` | `recording_status` NOT NULL default `'recorded'` | |
| `error` | `text` null | |
| `created_at` | `timestamptz` NOT NULL default `now()` | |

### `transcripts` → `Transcript`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `uuid` NOT NULL FK CASCADE |
| `recording_id` | `uuid` NOT NULL FK `recordings.id` CASCADE |
| `text` | `text` NOT NULL |
| `language` | `text` null |
| `provider` | `provider_id` NOT NULL |
| `model_id` | `text` NOT NULL |
| `created_at` | `timestamptz` NOT NULL default `now()` |

`RecordingRepository.findTranscriptId` uses `maybeSingle()` — there is no unique
constraint on `recording_id`, so duplicates are possible in principle. Preserve:
`SELECT id … ORDER BY created_at LIMIT 1`.

### `sticky_notes` → `app/modules/notes/models.py::StickyNote`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | AI extraction generates these client-side; keep the server default too |
| `user_id` | `uuid` NOT NULL FK CASCADE | |
| `space_id` | `uuid` NOT NULL FK `spaces.id` CASCADE | |
| `title` | `text` null | |
| `content` | `text` NOT NULL | |
| `type` | `note_type` NOT NULL default `'idea'` | |
| `color` | `text` null | |
| `x`, `y` | `real` NOT NULL | |
| `width` | `real` NOT NULL default `180` | Note: DB default 180/120, but `layout.ts` places new AI notes at 190×145 and children at 150×110 |
| `height` | `real` NOT NULL default `120` | |
| `parent_id` | `uuid` null FK `sticky_notes.id` ON DELETE SET NULL | Self-FK; the SET NULL never fires because deletes are soft — hence the promotion trigger |
| `z_index` | `int` NOT NULL default `0` | Never read today |
| `source_type` | `source_type` NOT NULL default `'manual'` | |
| `recording_id` | `uuid` null FK `recordings.id` SET NULL | Provenance |
| `transcript_id` | `uuid` null FK `transcripts.id` SET NULL | |
| `span_start`, `span_end` | `int` null | |
| `ai_action_id` | `uuid` null | No FK |
| `due_at` | `timestamptz` null | Added `0023` |
| `created_at` / `updated_at` | `timestamptz` NOT NULL default `now()` | |
| `deleted_at` | `timestamptz` null | Soft delete |

### `relationships` → `Relationship`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `uuid` NOT NULL FK CASCADE |
| `space_id` | `uuid` NOT NULL FK `spaces.id` CASCADE |
| `from_note_id` | `uuid` NOT NULL FK `sticky_notes.id` CASCADE |
| `to_note_id` | `uuid` NOT NULL FK `sticky_notes.id` CASCADE |
| `type` | `rel_type` NOT NULL default `'related'` |
| `created_by` | `text` NOT NULL default `'user'` — values `'user'` \| `'ai'` |
| `ai_action_id` | `uuid` null |
| `created_at` | `timestamptz` NOT NULL default `now()` |
| `deleted_at` | `timestamptz` null |

CHECK `no_self_link` (`from_note_id <> to_note_id`); partial UNIQUE `rel_unique`.

**No client currently reads or writes `relationships`** — only `ai-extract`
inserts them, and `features/canvas/components/NoteConnectors.tsx` draws
connectors from `parent_id`, not from this table. Expose
`GET /spaces/{id}/relationships` anyway for parity; note it in
[11](11-risks-open-questions.md).

### `note_groups` → `NoteGroup`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `uuid` NOT NULL FK CASCADE |
| `space_id` | `uuid` NOT NULL FK `spaces.id` CASCADE |
| `title` | `text` null |
| `x`, `y` | `real` NOT NULL |
| `width` | `real` NOT NULL default `460` |
| `height` | `real` NOT NULL default `360` |
| `color` | `text` null |
| `created_at` | `timestamptz` NOT NULL default `now()` |
| `deleted_at` | `timestamptz` null |

Membership is spatial, not relational — there is no join table and there must
not be one.

### `ai_actions` → `app/modules/ai/models.py::AiAction`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `uuid` NOT NULL FK CASCADE |
| `space_id` | `uuid` NOT NULL FK `spaces.id` CASCADE |
| `kind` | `ai_action_kind` NOT NULL |
| `status` | `ai_action_status` NOT NULL default `'pending'` |
| `recording_id` | `uuid` null FK SET NULL |
| `transcript_id` | `uuid` null FK SET NULL |
| `provider` | `provider_id` NOT NULL |
| `model_id` | `text` NOT NULL |
| `prompt_version` | `text` NOT NULL — `'extract_thoughts@8'` or `'write_note@1'` |
| `billed_to` | `text` NOT NULL default `'credits'` — `'credits'` \| `'byok'` |
| `credits_charged` | `int` NOT NULL default `0` |
| `input_tokens`, `output_tokens` | `int` null |
| `raw_cost_usd` | `numeric(10,6)` null |
| `raw_response` | `jsonb` null — `{ "text": "<model reply>" }` |
| `error` | `text` null |
| `created_at` | `timestamptz` NOT NULL default `now()` |
| `resolved_at` | `timestamptz` null |

### `ai_action_items` → `AiActionItem`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL FK CASCADE | |
| `ai_action_id` | `uuid` NOT NULL FK `ai_actions.id` CASCADE | |
| `operation` | `text` NOT NULL | **Inconsistent today:** `ai-extract` writes `'insert'`; `apply_ai_action`/`undo_ai_action` branch on `'create_note'` / `'create_relationship'`. See [11 §Q3](11-risks-open-questions.md#q3) |
| `target_type` | `text` NOT NULL — `'sticky_note'` | |
| `target_id` | `uuid` null | |
| `forward_patch` | `jsonb` NOT NULL | `ai-extract` stores the whole insert row |
| `inverse_patch` | `jsonb` NOT NULL | `ai-extract` stores `{"deleted_at": "now()"}` — a literal string, not a timestamp |
| `accepted` | `boolean` NOT NULL default `true` | |
| `applied_at` | `timestamptz` null | Never set by `ai-extract` |
| `sort_order` | `int` NOT NULL default `0` | |

### `timeline_events` → `app/modules/timeline/models.py::TimelineEvent`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `uuid` NOT NULL FK CASCADE |
| `space_id` | `uuid` NOT NULL FK `spaces.id` CASCADE |
| `type` | `text` NOT NULL — `'note_created'` \| `'note_updated'` \| `'note_deleted'` |
| `ref_id` | `uuid` null |
| `summary` | `text` NOT NULL — `coalesce(title, left(content, 60))` |
| `created_at` | `timestamptz` NOT NULL default `now()` |

No client reads timeline events today. Expose `GET /spaces/{id}/timeline`
anyway; the write path must not regress (see
[01 §2.5](01-current-surface.md#25-triggers--python)).

### `subscription_plans` → `app/modules/billing/models.py::SubscriptionPlan`

| Column | Type |
|---|---|
| `id` | `text` PK |
| `name` | `text` NOT NULL |
| `tagline` | `text` null |
| `price_egp` | `int` NOT NULL |
| `base_credits` | `int` NOT NULL |
| `bonus_pct` | `int` NOT NULL default `0` |
| `total_credits` | `int` GENERATED ALWAYS … STORED |
| `is_featured` | `boolean` NOT NULL default `false` |
| `enabled` | `boolean` NOT NULL default `true` |
| `sort_order` | `int` NOT NULL default `100` |
| `max_recording_minutes` | `int` NOT NULL default `5` (`0025`) |
| `is_byok` | `boolean` NOT NULL default `false` (`0025`) |
| `ai_enabled` | `boolean` NOT NULL default `true` (`0028`) |

### `subscriptions` → `Subscription`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `uuid` NOT NULL FK CASCADE |
| `plan_id` | `text` NOT NULL FK `subscription_plans.id` |
| `status` | `subscription_status` NOT NULL default `'pending'` |
| `channel` | `payment_channel` NOT NULL |
| `external_ref` | `text` null |
| `current_period_start` | `timestamptz` null |
| `current_period_end` | `timestamptz` null |
| `created_at` | `timestamptz` NOT NULL default `now()` |
| `cancelled_at` | `timestamptz` null |

Nothing renews a subscription — `0024`'s comment says so explicitly. Do **not**
add renewal in this migration.

---

## C. What the client is allowed to see

Response models are hand-written Pydantic classes. They must be built by
listing fields, never `model_config = ConfigDict(from_attributes=True)` over a
whole ORM object with `**row.__dict__`. Two specific bans:

| Never in any response | Why |
|---|---|
| `user_ai_keys.encrypted_key` | `0005`: `revoke select (encrypted_key) on user_ai_keys from authenticated`. The DB used to enforce it; now only the schema does |
| `users.encrypted_password` | Obvious, and there is no equivalent Supabase precedent because the column lived in a schema the client could not reach at all |

And two bans on **request** models:

| Never in any client-facing request | Why |
|---|---|
| `credits_balance`, `credits_reserved` | `t_guard_profile` (`0010`/`0017`) |
| `profiles.id`, `*.user_id` | Ownership comes from the token, never the body |
