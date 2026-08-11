-- ============================================================
-- MindSpace Migration 0024: Subscription plans
-- ============================================================
-- credit_packages sells credits once. This sells them monthly, at a better
-- rate than buying the same amount outright — a subscription that loses to a
-- one-off purchase is a pricing bug, so every tier here beats its equivalent
-- package (50 EGP: 625/mo here vs 550 one-off).
--
-- Credits are still credits: nothing downstream knows a subscription exists.
-- Granting goes through the same grant_credits RPC with reason 'purchase',
-- which the credits screen already labels.

create type payment_channel as enum ('google_pay', 'apple_pay', 'instapay', 'test_pay');

create type subscription_status as enum ('pending', 'active', 'cancelled', 'expired');

create table subscription_plans (
  id             text primary key,
  name           text not null,
  tagline        text,
  price_egp      int not null,
  base_credits   int not null,
  bonus_pct      int not null default 0,
  -- Same generated-column formula as credit_packages, deliberately.
  total_credits  int generated always as
                   (base_credits + (base_credits * bonus_pct / 100)) stored,
  is_featured    boolean not null default false,
  enabled        boolean not null default true,
  sort_order     int not null default 100
);

insert into subscription_plans
  (id, name, tagline, price_egp, base_credits, bonus_pct, is_featured, sort_order) values
  ('hobby', 'Hobby', 'For the odd thought worth keeping',  50,  500, 25, false, 10),
  ('plus',  'Plus',  'A habit, not an experiment',        150, 1500, 35, true,  20),
  ('pro',   'Pro',   'Thinking out loud every day',       300, 3000, 50, false, 30),
  ('max',   'Max',   'Everything, all of it, no counting',500, 5000, 60, false, 40);

create table subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users on delete cascade,
  plan_id              text not null references subscription_plans(id),
  status               subscription_status not null default 'pending',
  channel              payment_channel not null,
  external_ref         text,
  current_period_start timestamptz,
  -- Set on confirm so the UI can show a renewal date. Nothing advances it
  -- yet: recurring renewal is a cron follow-up (see 0012_cron.sql for the
  -- pattern), so today a subscription grants once and then lapses.
  current_period_end   timestamptz,
  created_at           timestamptz not null default now(),
  cancelled_at         timestamptz
);

create index on subscriptions (user_id, status);

-- Payments already carry the unique (channel, external_ref) that makes a
-- retried confirm idempotent; this just ties one to what it bought.
alter table payments add column subscription_id uuid references subscriptions(id);
alter table payments alter column package_id drop not null;

alter table subscription_plans enable row level security;
alter table subscriptions      enable row level security;

-- The catalogue is public to signed-in users; a subscription is read-only
-- from the client. Both writes happen in edge functions under service role —
-- a client that could insert here would grant itself a plan.
create policy "read enabled" on subscription_plans for select using (enabled);
create policy "read own"     on subscriptions      for select using (auth.uid() = user_id);
