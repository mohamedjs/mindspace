-- ============================================================
-- MindSpace Migration 0017: Fix the credit guard blocking its own RPCs
-- ============================================================
--
-- guard_profile_update() exists to stop a client UPDATE-ing its own
-- credits_balance / credits_reserved directly. It was gated on
--
--     current_setting('role') = 'authenticated'
--
-- but PostgREST sets that GUC once per request and SECURITY DEFINER does not
-- change it — only current_user switches to the function owner. So the guard
-- also fired *inside* reserve_credits/settle_credits/release_credits, and every
-- credit reservation raised 'credits are read-only from the client'. That made
-- transcription fail for every user with a platform key.
--
-- current_user is the correct signal: it is 'authenticated' for a direct client
-- write, and the function owner (postgres) inside a SECURITY DEFINER RPC.

drop trigger if exists t_guard_profile on profiles;

create trigger t_guard_profile before update on profiles
  for each row when (current_user in ('authenticated', 'anon'))
  execute function guard_profile_update();
