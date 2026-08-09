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
