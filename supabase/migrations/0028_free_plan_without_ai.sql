-- ============================================================
-- MindSpace Migration 0028: a genuinely free plan, and AI as an entitlement
-- ============================================================
-- Until now "free" meant "no subscription row", and it still came with AI:
-- 100 credits a month and a 5-minute recording cap. That made the app
-- unusable-without-paying the moment those credits ran out, even though every
-- non-AI feature — the canvas, sub-notes, groups, the list, the calendar,
-- reminders — costs us nothing to serve.
--
-- So AI becomes an entitlement rather than a balance. Free gets the whole app
-- with the voice pipeline switched off; every paid tier turns it back on and
-- meters it in credits exactly as before.
--
-- Credits are untouched. A plan with ai_enabled = false simply never reaches
-- the code that spends them.

alter table subscription_plans
  add column ai_enabled boolean not null default true;

-- The free tier becomes a real row rather than the absence of one. The plans
-- screen can then show the whole ladder, and the client has a single place to
-- read entitlements from instead of special-casing null.
insert into subscription_plans
  (id, name, tagline, price_egp, base_credits, bonus_pct, is_featured,
   is_byok, ai_enabled, max_recording_minutes, sort_order, enabled)
values
  ('free', 'Free', 'Every board, every note — think it through yourself',
   0, 0, 0, false, false, false, 0, 5, true)
on conflict (id) do update
  set ai_enabled            = excluded.ai_enabled,
      max_recording_minutes = excluded.max_recording_minutes,
      tagline               = excluded.tagline;

-- "Your AI" runs the writing on the user's own key but still transcribes on
-- ours, so it is very much an AI plan.
update subscription_plans set ai_enabled = true where id <> 'free';
