-- ============================================================
-- MindSpace Migration 0022: Default Space on Signup
-- ============================================================

-- Auto-create profile + grant 100 credits on signup + create default space
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, is_anonymous, credits_balance, free_refill_at)
  values (new.id, coalesce(new.is_anonymous, true), 100, current_date);

  insert into public.credit_ledger (user_id, delta, balance_after, reason)
  values (new.id, 100, 100, 'signup_grant');

  -- Create a default space
  insert into public.spaces (user_id, name, emoji)
  values (new.id, 'My MindSpace', 'lightbulb');

  return new;
end $$;
