-- ============================================================
-- MindSpace Migration 0001: Extensions
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vector;
-- ============================================================
-- MindSpace Migration 0002: Enums
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
-- MindSpace Migration 0003: Profiles
-- ============================================================
create table profiles (
  id                uuid primary key references auth.users on delete cascade,
  display_name      text,
  is_anonymous      boolean not null default true,
  credits_balance   int not null default 0,
  credits_reserved  int not null default 0,
  free_refill_at    date,
  chat_model_id     uuid,
  transcribe_model_id uuid,
  timezone          text not null default 'Africa/Cairo',
  locale            text not null default 'en',
  created_at        timestamptz not null default now(),
  constraint credits_non_negative check (credits_balance >= 0),
  constraint reserved_non_negative check (credits_reserved >= 0)
);

-- Auto-create profile + grant 100 credits on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, is_anonymous, credits_balance, free_refill_at)
  values (new.id, coalesce(new.is_anonymous, true), 100, current_date);

  insert into public.credit_ledger (user_id, delta, balance_after, reason)
  values (new.id, 100, 100, 'signup_grant');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
-- ============================================================
-- MindSpace Migration 0004: AI Models
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
  unique (provider, model_id)
);

-- Add FK from profiles to ai_models
alter table profiles
  add constraint fk_chat_model      foreign key (chat_model_id)      references ai_models(id),
  add constraint fk_transcribe_model foreign key (transcribe_model_id) references ai_models(id);

-- ai_models is world-readable (public price list), nobody can write
alter table ai_models enable row level security;
create policy "read models" on ai_models for select to authenticated using (enabled);
-- ============================================================
-- MindSpace Migration 0005: User AI Keys (BYOK)
-- ============================================================
create table user_ai_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  provider      provider_id not null,
  label         text,
  encrypted_key bytea not null,
  key_hint      text not null,
  base_url      text,
  is_active     boolean not null default true,
  last_used_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  unique (user_id, provider, label)
);

-- The client must NEVER be able to read the encrypted key blob
revoke select (encrypted_key) on user_ai_keys from authenticated;
-- ============================================================
-- MindSpace Migration 0006: Credits System
-- ============================================================

-- Credit packages (IAP products)
create table credit_packages (
  id            text primary key,
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

-- Seed the 4 packages
insert into credit_packages
  (id, name, price_egp, base_credits, bonus_pct, is_featured, sort_order) values
  ('starter_50',  'Starter', 50,   500, 10, false, 10),
  ('regular_100', 'Regular', 100, 1000, 20, true,  20),
  ('pro_250',     'Pro',     250, 2500, 30, false, 30),
  ('max_500',     'Max',     500, 5000, 40, false, 40);

-- Append-only credit ledger — NEVER UPDATE or DELETE rows
create table credit_ledger (
  id            bigserial primary key,
  user_id       uuid not null references auth.users on delete cascade,
  delta         int not null,
  balance_after int not null,
  reason        ledger_reason not null,
  ai_action_id  uuid,
  package_id    text references credit_packages(id),
  payment_ref   text,
  meta          jsonb,
  created_at    timestamptz not null default now()
);
create index on credit_ledger (user_id, created_at desc);

-- In-flight credit holds for concurrency safety
create table credit_reservations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  amount       int not null check (amount > 0),
  status       text not null default 'held',
  ai_action_id uuid,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes'
);
create index on credit_reservations (status, expires_at);

-- Payments table (IAP + Paymob)
create table payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  package_id    text not null references credit_packages(id),
  amount_egp    int not null,
  channel       text not null,
  external_ref  text not null,
  status        text not null default 'pending',
  raw_receipt   jsonb,
  created_at    timestamptz not null default now(),
  verified_at   timestamptz,
  unique (channel, external_ref)
);
-- ============================================================
-- MindSpace Migration 0007: Core Tables
-- (spaces, recordings, transcripts, sticky_notes, relationships)
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
  span_start      int,
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
-- MindSpace Migration 0008: AI Actions
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
  billed_to      text not null default 'credits',
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

-- One reversible mutation per item. Undo replays inverse_patch in reverse sort_order.
create table ai_action_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  ai_action_id  uuid not null references ai_actions on delete cascade,
  operation     text not null,
  target_type   text not null,
  target_id     uuid,
  forward_patch jsonb not null,
  inverse_patch jsonb not null,
  accepted      boolean not null default true,
  applied_at    timestamptz,
  sort_order    int not null default 0
);
create index on ai_action_items (ai_action_id, sort_order);
-- ============================================================
-- MindSpace Migration 0009: Timeline + Triggers
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

-- Auto-write timeline events on note changes
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
      return new;  -- position-only change: no timeline noise
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

-- Auto-update updated_at on row change
create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger t_notes_touch before update on sticky_notes
  for each row execute function touch_updated_at();
create trigger t_spaces_touch before update on spaces
  for each row execute function touch_updated_at();
-- ============================================================
-- MindSpace Migration 0010: Row Level Security
-- ============================================================

-- Enable RLS on every table
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

-- Money tables: READ ONLY from client. Writes via SECURITY DEFINER RPCs only.
create policy "read own" on profiles            for select using (auth.uid() = id);
create policy "update own prefs" on profiles    for update using (auth.uid() = id)
  with check (auth.uid() = id);
create policy "read own" on credit_ledger       for select using (auth.uid() = user_id);
create policy "read own" on credit_reservations for select using (auth.uid() = user_id);
create policy "read own" on payments            for select using (auth.uid() = user_id);
create policy "read all" on credit_packages     for select using (enabled);

-- Block direct credit tampering from client
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
-- ============================================================
-- MindSpace Migration 0011: Credit RPCs
-- ============================================================

-- Reserve credits BEFORE a provider request. Returns reservation id or raises.
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

-- Settle credits AFTER the provider responds, with true amount.
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

-- Release credits when provider call fails. Charges nothing.
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

-- Grant credits after VERIFIED payment. Service role only.
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

-- Revoke grant_credits from client roles
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
-- ============================================================
-- MindSpace Migration 0012: Cron Jobs
-- ============================================================

-- Monthly free credit refill — 1st of each month at 02:00
select cron.schedule('mindspace-free-refill', '0 2 1 * *', $$ select monthly_free_refill(); $$);

-- Sweep abandoned reservations every hour
select cron.schedule('mindspace-release-stale-reservations', '5 * * * *', $$
  update credit_reservations set status = 'released'
   where status = 'held' and expires_at < now();
  update profiles p set credits_reserved = coalesce((
    select sum(amount) from credit_reservations r
     where r.user_id = p.id and r.status = 'held'), 0);
$$);
-- ============================================================
-- MindSpace Migration 0013: Storage Bucket
-- ============================================================

-- Create private recordings bucket with 25MB size limit
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 26214400, array['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav']);

-- RLS policies for storage: path-scoped to user_id
create policy "Users can upload own recordings"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own recordings"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own recordings"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- ============================================================
-- MindSpace Migration 0014: Bulk Move Notes RPC
-- ============================================================

create or replace function bulk_move_notes(
  p_moves jsonb  -- array of {id: uuid, x: real, y: real}
) returns void
language plpgsql security invoker as $$
declare v_move jsonb;
begin
  for v_move in select * from jsonb_array_elements(p_moves)
  loop
    update sticky_notes
       set x = (v_move->>'x')::real,
           y = (v_move->>'y')::real
     where id = (v_move->>'id')::uuid
       and user_id = auth.uid()
       and deleted_at is null;
  end loop;
end $$;
-- ============================================================
-- MindSpace Migration 0015: Apply/Undo AI Action RPCs
-- ============================================================

-- Apply AI action: single transaction applying forward_patches for accepted items
create or replace function apply_ai_action(
  p_action_id uuid,
  p_accepted_item_ids uuid[]
) returns void
language plpgsql security definer as $$
declare
  v_item record;
  v_user uuid := auth.uid();
  v_action_user uuid;
  v_patch jsonb;
  v_note_id uuid;
begin
  -- Verify ownership
  select user_id into v_action_user from ai_actions where id = p_action_id;
  if v_action_user is null or v_action_user <> v_user then
    raise exception 'action not found or not owned';
  end if;

  -- Mark which items are accepted
  update ai_action_items
     set accepted = (id = any(p_accepted_item_ids))
   where ai_action_id = p_action_id;

  -- Apply forward_patch for each accepted item in sort_order
  for v_item in
    select * from ai_action_items
     where ai_action_id = p_action_id
       and accepted = true
     order by sort_order asc
  loop
    v_patch := v_item.forward_patch;

    if v_item.operation = 'create_note' then
      insert into sticky_notes (
        id, user_id, space_id, title, content, type, color,
        x, y, width, height, parent_id, source_type,
        recording_id, transcript_id, span_start, span_end, ai_action_id
      ) values (
        (v_patch->>'id')::uuid,
        v_user,
        (v_patch->>'space_id')::uuid,
        v_patch->>'title',
        v_patch->>'content',
        (v_patch->>'type')::note_type,
        v_patch->>'color',
        (v_patch->>'x')::real,
        (v_patch->>'y')::real,
        coalesce((v_patch->>'width')::real, 180),
        coalesce((v_patch->>'height')::real, 120),
        (v_patch->>'parent_id')::uuid,
        'ai'::source_type,
        (v_patch->>'recording_id')::uuid,
        (v_patch->>'transcript_id')::uuid,
        (v_patch->>'span_start')::int,
        (v_patch->>'span_end')::int,
        p_action_id
      );
      v_note_id := (v_patch->>'id')::uuid;

    elsif v_item.operation = 'create_relationship' then
      insert into relationships (
        id, user_id, space_id, from_note_id, to_note_id, type, created_by, ai_action_id
      ) values (
        (v_patch->>'id')::uuid,
        v_user,
        (v_patch->>'space_id')::uuid,
        (v_patch->>'from_note_id')::uuid,
        (v_patch->>'to_note_id')::uuid,
        (v_patch->>'type')::rel_type,
        'ai',
        p_action_id
      );
    end if;

    update ai_action_items set applied_at = now() where id = v_item.id;
  end loop;

  -- Update action status
  if array_length(p_accepted_item_ids, 1) = (
    select count(*) from ai_action_items where ai_action_id = p_action_id
  ) then
    update ai_actions set status = 'accepted', resolved_at = now() where id = p_action_id;
  elsif array_length(p_accepted_item_ids, 1) > 0 then
    update ai_actions set status = 'partially_accepted', resolved_at = now() where id = p_action_id;
  else
    update ai_actions set status = 'rejected', resolved_at = now() where id = p_action_id;
  end if;
end $$;

-- Undo AI action: replay inverse_patches in reverse order
create or replace function undo_ai_action(p_action_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_item record;
  v_user uuid := auth.uid();
  v_action_user uuid;
  v_patch jsonb;
begin
  select user_id into v_action_user from ai_actions where id = p_action_id;
  if v_action_user is null or v_action_user <> v_user then
    raise exception 'action not found or not owned';
  end if;

  -- Replay inverse_patch in reverse sort_order
  for v_item in
    select * from ai_action_items
     where ai_action_id = p_action_id
       and accepted = true
       and applied_at is not null
     order by sort_order desc
  loop
    v_patch := v_item.inverse_patch;

    if v_item.operation = 'create_note' then
      -- Inverse of create is soft-delete
      update sticky_notes set deleted_at = now()
       where id = (v_patch->>'id')::uuid and user_id = v_user;

    elsif v_item.operation = 'create_relationship' then
      -- Inverse of create is soft-delete
      update relationships set deleted_at = now()
       where id = (v_patch->>'id')::uuid and user_id = v_user;
    end if;

    update ai_action_items set applied_at = null where id = v_item.id;
  end loop;

  update ai_actions set status = 'undone', resolved_at = now() where id = p_action_id;
end $$;
-- ============================================================
-- MindSpace Seed Data
-- ============================================================

-- Seed AI models
insert into ai_models
 (provider, model_id, display_name, kind, input_price_m, output_price_m,
  price_per_min, credit_multiplier, is_default, tier, enabled, sort_order)
values
 -- TEXT — MVP default
 ('openrouter','openai/gpt-oss-120b','GPT-OSS 120B','chat',
   0.03, 0.17, null, 1.0, true, 'free', true, 10),

 -- TRANSCRIPTION — MVP default
 ('openrouter','openai/gpt-transcribe','GPT Transcribe','transcribe',
   null, null, 0.0045, 1.0, true, 'free', true, 10),
 ('openrouter','openai/gpt-4o-mini-transcribe','GPT-4o Mini Transcribe','transcribe',
   null, null, 0.0030, 0.7, false, 'free', true, 20),
 ('openrouter','openai/gpt-4o-transcribe','GPT-4o Transcribe','transcribe',
   null, null, 0.0060, 1.3, false, 'paid', true, 30);
