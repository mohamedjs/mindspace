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
