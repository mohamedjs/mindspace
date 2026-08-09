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
