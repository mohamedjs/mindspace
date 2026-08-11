-- ============================================================
-- MindSpace Migration 0025: Recording caps, the BYOK plan, direct providers
-- ============================================================

-- How long a single recording may run, per plan. The free tier gets 5 minutes;
-- paid tiers get progressively longer. Enforced client-side in RecordScreen,
-- which fails closed to the free cap whenever the plan is unknown.
alter table subscription_plans add column max_recording_minutes int not null default 5;

-- "Your AI" is a plan in the UI but not a purchase: it costs nothing, grants
-- no credits, and simply unlocks the BYOK key screen. Requests then run on the
-- user's own provider account, billed by that provider, and resolveApiKey
-- already marks them usesPlatformKey:false so they never touch credits.
alter table subscription_plans add column is_byok boolean not null default false;

update subscription_plans set max_recording_minutes = 15 where id = 'hobby';
update subscription_plans set max_recording_minutes = 30 where id = 'plus';
update subscription_plans set max_recording_minutes = 60 where id = 'pro';
update subscription_plans set max_recording_minutes = 120 where id = 'max';

insert into subscription_plans
  (id, name, tagline, price_egp, base_credits, bonus_pct, is_featured,
   is_byok, max_recording_minutes, sort_order) values
  ('byok', 'Your AI', 'Bring your own key — your account, your limits',
   0, 0, 0, false, true, 120, 50);

-- ============================================================
-- Direct providers, all BYOK-only
-- ============================================================
-- The platform holds no OpenAI / Google / Anthropic key, so byok_only is what
-- stops resolveApiKey throwing no_platform_key at runtime for anyone who picks
-- one. These only work once the user is on the "Your AI" plan with a key saved.
--
-- Anthropic is chat-only on purpose: its OpenAI-compatibility layer documents
-- that audio input "is ignored and stripped from input", so it can never serve
-- a transcribe model.

insert into ai_models
  (provider, model_id, display_name, kind, input_price_m, output_price_m,
   credit_multiplier, tier, byok_only, enabled, sort_order)
values
  ('anthropic', 'claude-opus-5',      'Claude Opus 5 (your key)',     'chat', 5,    25,   1, 'paid', true, true, 200),
  ('anthropic', 'claude-sonnet-5',    'Claude Sonnet 5 (your key)',   'chat', 3,    15,   1, 'paid', true, true, 210),
  ('anthropic', 'claude-haiku-4-5',   'Claude Haiku 4.5 (your key)',  'chat', 1,    5,    1, 'paid', true, true, 220),
  ('openai',    'gpt-5.2',            'GPT-5.2 (your key)',           'chat', 1.25, 10,   1, 'paid', true, true, 230),
  ('openai',    'gpt-5.2-mini',       'GPT-5.2 mini (your key)',      'chat', 0.25, 2,    1, 'paid', true, true, 240),
  ('google',    'gemini-3-pro',       'Gemini 3 Pro (your key)',      'chat', 1.25, 10,   1, 'paid', true, true, 250),
  ('google',    'gemini-3-flash',     'Gemini 3 Flash (your key)',    'chat', 0.3,  2.5,  1, 'paid', true, true, 260)
on conflict (provider, model_id, kind) do nothing;

-- Speech-to-text on the user's own key. Anthropic is deliberately absent.
insert into ai_models
  (provider, model_id, display_name, kind, price_per_min,
   credit_multiplier, tier, byok_only, enabled, sort_order)
values
  ('openai', 'whisper-1',                 'Whisper (your key)',           'transcribe', 0.006, 1, 'paid', true, true, 200),
  ('openai', 'gpt-4o-mini-transcribe',    'GPT-4o mini STT (your key)',   'transcribe', 0.003, 1, 'paid', true, true, 210),
  ('google', 'gemini-3-flash',            'Gemini 3 Flash (your key)',    'transcribe', 0.002, 1, 'paid', true, true, 220)
on conflict (provider, model_id, kind) do nothing;
