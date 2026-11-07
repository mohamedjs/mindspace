-- ============================================================
-- MindSpace Migration 0001: Baseline Schema
-- ============================================================

-- Removed business logic functions and their replacing phases:
--   - handle_new_user()                 -> Phase 02 (Auth)
--   - delete_own_account()              -> Phase 02 (Auth)
--   - bulk_move_notes()                 -> Phase 03 (Core)
--   - promote_children_on_soft_delete() -> Phase 03 (Core)
--   - on_note_change()                  -> Phase 03 (Core / Timeline)
--   - guard_profile_update()            -> Phase 04 (Credits / BYOK)
--   - reserve_credits()                 -> Phase 04 (Credits / BYOK)
--   - settle_credits()                  -> Phase 04 (Credits / BYOK)
--   - release_credits()                 -> Phase 04 (Credits / BYOK)
--   - grant_credits()                   -> Phase 04 (Credits / BYOK)
--   - monthly_free_refill()             -> Phase 04 (Credits / BYOK)
--   - sweep_stale_reservations()        -> Phase 04 (Credits / BYOK)
--   - apply_ai_action()                 -> Phase 06 (AI)
--   - undo_ai_action()                  -> Phase 06 (AI)

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ============================================================
-- Enums
-- ============================================================
create type note_type as enum (
  'idea', 'task', 'question', 'decision', 'reference', 'thought', 'summary'
);

create type rel_type as enum (
  'related', 'depends_on', 'supports', 'contradicts', 'derived_from', 'child_of'
);

create type source_type as enum (
  'voice', 'manual', 'ai'
);

create type recording_status as enum (
  'recorded', 'uploading', 'queued', 'splitting', 'transcribing', 'transcribed', 'extracting', 'completed', 'failed'
);

create type ai_action_kind as enum (
  'extract_thoughts', 'detect_relations', 'thought_evolution', 'weekly_digest'
);

create type ai_action_status as enum (
  'pending', 'proposed', 'accepted', 'partially_accepted', 'rejected', 'undone', 'failed'
);

create type provider_id as enum (
  'openrouter', 'openai', 'google', 'anthropic', 'nvidia', 'custom'
);

create type model_kind as enum (
  'chat', 'transcribe'
);

create type ledger_reason as enum (
  'signup_grant', 'monthly_refill', 'purchase', 'usage', 'refund', 'reversal', 'admin_adjust'
);

create type payment_channel as enum (
  'google_pay', 'apple_pay', 'instapay', 'test_pay'
);

create type subscription_status as enum (
  'pending', 'active', 'cancelled', 'expired'
);

-- ============================================================
-- Users and Auth Tokens
-- ============================================================
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext unique,
  password_hash text,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table refresh_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  family_id  uuid not null default gen_random_uuid(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index ix_refresh_tokens_user_id on refresh_tokens (user_id);
create index ix_refresh_tokens_family_id on refresh_tokens (family_id);

create table password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index ix_password_reset_tokens_user_id on password_reset_tokens (user_id);

-- ============================================================
-- AI Models
-- ============================================================
create table ai_models (
  id                uuid primary key default gen_random_uuid(),
  provider          provider_id not null,
  model_id          text not null,
  display_name      text not null,
  kind              model_kind not null,
  input_price_m     numeric(10,4),
  output_price_m    numeric(10,4),
  price_per_min     numeric(10,5),
  credit_multiplier numeric(6,2) not null default 1.0,
  is_default        boolean not null default false,
  byok_only         boolean not null default false,
  tier              text not null default 'free',
  enabled           boolean not null default true,
  notes             text,
  sort_order        int not null default 100,
  price_synced_at   timestamptz,
  constraint ai_models_provider_model_id_kind_key unique (provider, model_id, kind)
);

-- ============================================================
-- Profiles
-- ============================================================
create table profiles (
  id                  uuid primary key references users(id) on delete cascade,
  display_name        text,
  is_anonymous        boolean not null default true,
  credits_balance     int not null default 0,
  credits_reserved    int not null default 0,
  free_refill_at      date,
  chat_model_id       uuid references ai_models(id),
  transcribe_model_id uuid references ai_models(id),
  timezone            text not null default 'Africa/Cairo',
  locale              text not null default 'en',
  created_at          timestamptz not null default now(),
  constraint credits_non_negative check (credits_balance >= 0),
  constraint reserved_non_negative check (credits_reserved >= 0)
);

-- ============================================================
-- BYOK User Keys
-- ============================================================
create table user_ai_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  provider      provider_id not null,
  label         text,
  encrypted_key bytea not null,
  key_hint      text not null,
  is_active     boolean not null default true,
  last_used_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  unique (user_id, provider, label)
);
create unique index ux_user_ai_keys_active_per_provider
  on user_ai_keys (user_id, provider)
  where is_active = true;

-- ============================================================
-- Credit Packages & Plans
-- ============================================================
create table credit_packages (
  id                    text primary key,
  name                  text not null,
  price_egp             int not null,
  base_credits          int not null,
  bonus_pct             int not null default 0,
  total_credits         int generated always as
                          (base_credits + (base_credits * bonus_pct / 100)) stored,
  is_featured           boolean not null default false,
  store_product_id_ios     text,
  store_product_id_android text,
  enabled               boolean not null default true,
  sort_order            int not null default 100
);

create table subscription_plans (
  id                    text primary key,
  name                  text not null,
  tagline               text,
  price_egp             int not null,
  base_credits          int not null,
  bonus_pct             int not null default 0,
  total_credits         int generated always as
                          (base_credits + (base_credits * bonus_pct / 100)) stored,
  is_featured           boolean not null default false,
  enabled               boolean not null default true,
  sort_order            int not null default 100,
  max_recording_minutes int not null default 5,
  is_byok               boolean not null default false,
  ai_enabled            boolean not null default true
);

create table subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  plan_id              text not null references subscription_plans(id),
  status               subscription_status not null default 'pending',
  channel              payment_channel not null,
  external_ref         text,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  created_at           timestamptz not null default now(),
  cancelled_at         timestamptz
);
create index ix_subscriptions_user_status on subscriptions (user_id, status);

create table credit_ledger (
  id            bigserial primary key,
  user_id       uuid not null references users(id) on delete cascade,
  delta         int not null,
  balance_after int not null,
  reason        ledger_reason not null,
  ai_action_id  uuid,
  package_id    text references credit_packages(id),
  payment_ref   text,
  meta          jsonb,
  created_at    timestamptz not null default now()
);
create index ix_credit_ledger_user_created on credit_ledger (user_id, created_at desc);

create table credit_reservations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  amount       int not null check (amount > 0),
  status       text not null default 'held',
  ai_action_id uuid,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes'
);
create index ix_credit_reservations_status_expires on credit_reservations (status, expires_at);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  package_id      text references credit_packages(id),
  subscription_id uuid references subscriptions(id),
  amount_egp      int not null,
  channel         text not null,
  external_ref    text not null,
  status          text not null default 'pending',
  raw_receipt     jsonb,
  created_at      timestamptz not null default now(),
  verified_at     timestamptz,
  unique (channel, external_ref)
);

-- ============================================================
-- Core Canvas & Voice Entities
-- ============================================================
create table spaces (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  name             text not null,
  emoji            text not null default '💡',
  canvas_zoom      real not null default 1,
  canvas_x         real not null default 0,
  canvas_y         real not null default 0,
  note_count       int not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index ix_spaces_user_activity on spaces (user_id, last_activity_at desc) where deleted_at is null;

create table recordings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  space_id       uuid not null references spaces(id) on delete cascade,
  storage_path   text,
  local_only     boolean not null default true,
  duration_ms    int not null,
  size_bytes     int,
  mime_type      text not null default 'audio/m4a',
  status         recording_status not null default 'recorded',
  error          text,
  claimed_at     timestamptz,
  attempts       int not null default 0,
  process_mode   text,
  target_note_id uuid,
  parent_note_id uuid,
  kind           text not null default 'note',
  created_at     timestamptz not null default now()
);
create index ix_recordings_space_created on recordings (space_id, created_at desc);
create index ix_recordings_pending on recordings (created_at) where status = 'queued';

create table recording_parts (
  id              uuid primary key default gen_random_uuid(),
  recording_id    uuid not null references recordings(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  idx             int not null,
  blob_key        text not null,
  duration_ms     int,
  status          text not null default 'uploaded',
  transcript_text text,
  attempts        int not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  unique (recording_id, idx)
);
create index ix_recording_parts_user_id on recording_parts (user_id);

create table transcripts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  recording_id uuid not null references recordings(id) on delete cascade,
  text         text not null,
  language     text,
  provider     provider_id not null,
  model_id     text not null,
  created_at   timestamptz not null default now()
);
create index ix_transcripts_recording on transcripts (recording_id);

create table sticky_notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  space_id      uuid not null references spaces(id) on delete cascade,
  title         text,
  content       text not null,
  type          note_type not null default 'idea',
  color         text,
  x             real not null,
  y             real not null,
  width         real not null default 180,
  height        real not null default 120,
  parent_id     uuid references sticky_notes(id) on delete set null,
  z_index       int not null default 0,
  source_type   source_type not null default 'manual',
  recording_id  uuid references recordings(id) on delete set null,
  transcript_id uuid references transcripts(id) on delete set null,
  span_start    int,
  span_end      int,
  ai_action_id  uuid,
  due_at        timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index ix_sticky_notes_space_live on sticky_notes (space_id) where deleted_at is null;
create index ix_sticky_notes_space_xy on sticky_notes (space_id, x, y);
create index ix_sticky_notes_parent on sticky_notes (parent_id);
create index ix_sticky_notes_recording on sticky_notes (recording_id);
create index ix_sticky_notes_space_due on sticky_notes (space_id, due_at) where deleted_at is null;

-- Add deferred foreign keys from recordings to sticky_notes
alter table recordings
  add constraint fk_recordings_target_note foreign key (target_note_id) references sticky_notes(id) on delete set null,
  add constraint fk_recordings_parent_note foreign key (parent_note_id) references sticky_notes(id) on delete set null;

create table relationships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  space_id     uuid not null references spaces(id) on delete cascade,
  from_note_id uuid not null references sticky_notes(id) on delete cascade,
  to_note_id   uuid not null references sticky_notes(id) on delete cascade,
  type         rel_type not null default 'related',
  created_by   text not null default 'user',
  ai_action_id uuid,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint no_self_link check (from_note_id <> to_note_id)
);
create unique index rel_unique on relationships (from_note_id, to_note_id, type)
  where deleted_at is null;

create table note_groups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  space_id   uuid not null references spaces(id) on delete cascade,
  title      text,
  x          real not null,
  y          real not null,
  width      real not null default 460,
  height     real not null default 360,
  color      text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index ix_note_groups_space_live on note_groups (space_id) where deleted_at is null;

-- ============================================================
-- AI Actions & Timeline
-- ============================================================
create table ai_actions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  space_id        uuid not null references spaces(id) on delete cascade,
  kind            ai_action_kind not null,
  status          ai_action_status not null default 'pending',
  recording_id    uuid references recordings(id) on delete set null,
  transcript_id   uuid references transcripts(id) on delete set null,
  provider        provider_id not null,
  model_id        text not null,
  prompt_version  text not null,
  billed_to       text not null default 'credits',
  credits_charged int not null default 0,
  input_tokens    int,
  output_tokens   int,
  raw_cost_usd    numeric(10,6),
  raw_response    jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index ix_ai_actions_space_created on ai_actions (space_id, created_at desc);
create index ix_ai_actions_user_created on ai_actions (user_id, created_at desc);

create table ai_action_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  ai_action_id  uuid not null references ai_actions(id) on delete cascade,
  operation     text not null,
  target_type   text not null,
  target_id     uuid,
  forward_patch jsonb not null,
  inverse_patch jsonb not null,
  accepted      boolean not null default true,
  applied_at    timestamptz,
  sort_order    int not null default 0
);
create index ix_ai_action_items_action_sort on ai_action_items (ai_action_id, sort_order);

create table timeline_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  space_id   uuid not null references spaces(id) on delete cascade,
  type       text not null,
  ref_id     uuid,
  summary    text not null,
  created_at timestamptz not null default now()
);
create index ix_timeline_events_space_created on timeline_events (space_id, created_at desc);

-- ============================================================
-- Data Triggers
-- ============================================================
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger t_users_touch
  before update on users
  for each row execute function touch_updated_at();

create trigger t_spaces_touch
  before update on spaces
  for each row execute function touch_updated_at();

create trigger t_notes_touch
  before update on sticky_notes
  for each row execute function touch_updated_at();
