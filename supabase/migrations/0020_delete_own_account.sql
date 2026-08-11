-- ============================================================
-- MindSpace Migration 0020: Self-service account deletion
-- ============================================================
-- spaces.user_id / user_ai_keys.user_id carry no FK (RLS-only ownership), so
-- deleting auth.users would not cascade to them. Purge owned content first,
-- then the auth row — profiles cascades from that via its FK.
-- Ledger/payment/reservation history is kept for accounting even after the
-- account is gone.

create or replace function public.delete_own_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.user_ai_keys where user_id = uid;
  delete from public.spaces where user_id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
