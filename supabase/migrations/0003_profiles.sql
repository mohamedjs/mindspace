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
