-- ============================================================
-- MindSpace Seed Data
-- ============================================================

-- ============================================================
-- 1. Credit Packages
-- ============================================================
insert into credit_packages
  (id, name, price_egp, base_credits, bonus_pct, is_featured, sort_order)
values
  ('starter_50',  'Starter', 50,   500, 10, false, 10),
  ('regular_100', 'Regular', 100, 1000, 20, true,  20),
  ('pro_250',     'Pro',     250, 2500, 30, false, 30),
  ('max_500',     'Max',     500, 5000, 40, false, 40)
on conflict (id) do update set
  name         = excluded.name,
  price_egp    = excluded.price_egp,
  base_credits = excluded.base_credits,
  bonus_pct    = excluded.bonus_pct,
  is_featured  = excluded.is_featured,
  sort_order   = excluded.sort_order;

-- ============================================================
-- 2. Subscription Plans
-- ============================================================
insert into subscription_plans
  (id, name, tagline, price_egp, base_credits, bonus_pct, is_featured,
   is_byok, ai_enabled, max_recording_minutes, sort_order, enabled)
values
  ('free',  'Free',    'Every board, every note — think it through yourself',               0,    0,  0, false, false, false,   0,  5, true),
  ('hobby', 'Hobby',   'For the odd thought worth keeping',                                50,  500, 25, false, false,  true,  15, 10, true),
  ('plus',  'Plus',    'A habit, not an experiment',                                      150, 1500, 35,  true, false,  true,  30, 20, true),
  ('pro',   'Pro',     'Thinking out loud every day',                                     300, 3000, 50, false, false,  true,  60, 30, true),
  ('max',   'Max',     'Everything, all of it, no counting',                              500, 5000, 60, false, false,  true, 120, 40, true),
  ('byok',  'Your AI', 'Your key for the thinking, our credits for the listening',         50,  900,  0, false,  true,  true, 120, 50, true)
on conflict (id) do update set
  name                  = excluded.name,
  tagline               = excluded.tagline,
  price_egp             = excluded.price_egp,
  base_credits          = excluded.base_credits,
  bonus_pct             = excluded.bonus_pct,
  is_featured           = excluded.is_featured,
  is_byok               = excluded.is_byok,
  ai_enabled            = excluded.ai_enabled,
  max_recording_minutes = excluded.max_recording_minutes,
  sort_order            = excluded.sort_order,
  enabled               = excluded.enabled;

-- ============================================================
-- 3. AI Models
-- ============================================================

-- ===== TEXT (OpenRouter) =====
insert into ai_models
  (provider, model_id, display_name, kind, input_price_m, output_price_m,
   price_per_min, credit_multiplier, is_default, byok_only, tier, enabled, sort_order)
values
  ('openrouter', 'deepseek/deepseek-v4-flash',           'DeepSeek V4 Flash',       'chat', 0.140, 0.280, null, 1.0, true,  false, 'free', true, 10),
  ('openrouter', 'qwen/qwen3.7-flash',                  'Qwen 3.7 Flash',          'chat', 0.030, 0.130, null, 0.5, false, false, 'free', true, 20),
  ('openrouter', 'google/gemini-3.1-flash-lite-preview', 'Gemini 3.1 Flash Lite',   'chat', 0.250, 1.500, null, 1.5, false, false, 'free', true, 30),
  ('openrouter', 'moonshotai/kimi-k2.5',                 'Kimi K2.5',               'chat', 0.570, 2.850, null, 3.0, false, false, 'paid', true, 40),
  ('openrouter', 'z-ai/glm-5',                           'GLM-5',                   'chat', 0.950, 2.550, null, 3.0, false, false, 'paid', true, 50)
on conflict (provider, model_id, kind) do update set
  display_name      = excluded.display_name,
  input_price_m     = excluded.input_price_m,
  output_price_m    = excluded.output_price_m,
  credit_multiplier = excluded.credit_multiplier,
  is_default        = excluded.is_default,
  byok_only         = excluded.byok_only,
  tier              = excluded.tier,
  enabled           = excluded.enabled,
  sort_order        = excluded.sort_order;

-- ===== SPEECH-TO-TEXT (OpenRouter) =====
insert into ai_models
  (provider, model_id, display_name, kind, input_price_m, output_price_m,
   price_per_min, credit_multiplier, is_default, byok_only, tier, enabled, sort_order)
values
  ('openrouter', 'google/gemini-2.5-flash',              'Gemini 2.5 Flash',                'transcribe', null, null, 0.0010, 1.0, true,  false, 'free', true, 10),
  ('openrouter', 'google/gemini-2.5-flash-lite',         'Gemini 2.5 Flash Lite (cheapest)','transcribe', null, null, 0.0003, 0.5, false, false, 'free', true, 20),
  ('openrouter', 'google/gemini-3.1-flash-lite-preview', 'Gemini 3.1 Flash Lite',           'transcribe', null, null, 0.0005, 0.7, false, false, 'free', true, 30),
  ('openrouter', 'google/gemini-3-flash-preview',        'Gemini 3 Flash',                  'transcribe', null, null, 0.0010, 1.0, false, false, 'free', true, 40),
  ('openrouter', 'google/gemini-2.5-pro',                'Gemini 2.5 Pro (most accurate)',  'transcribe', null, null, 0.0013, 1.5, false, false, 'paid', true, 50)
on conflict (provider, model_id, kind) do update set
  display_name      = excluded.display_name,
  price_per_min     = excluded.price_per_min,
  credit_multiplier = excluded.credit_multiplier,
  is_default        = excluded.is_default,
  byok_only         = excluded.byok_only,
  tier              = excluded.tier,
  enabled           = excluded.enabled,
  sort_order        = excluded.sort_order;

-- ===== DIRECT PROVIDERS (BYOK-only Chat) =====
insert into ai_models
  (provider, model_id, display_name, kind, input_price_m, output_price_m,
   credit_multiplier, tier, byok_only, enabled, sort_order)
values
  ('anthropic', 'claude-opus-5',      'Claude Opus 5 (your key)',     'chat', 5.0,  25.0, 1, 'paid', true, true, 200),
  ('anthropic', 'claude-sonnet-5',    'Claude Sonnet 5 (your key)',   'chat', 3.0,  15.0, 1, 'paid', true, true, 210),
  ('anthropic', 'claude-haiku-4-5',   'Claude Haiku 4.5 (your key)',  'chat', 1.0,   5.0, 1, 'paid', true, true, 220),
  ('openai',    'gpt-5.2',            'GPT-5.2 (your key)',           'chat', 1.25, 10.0, 1, 'paid', true, true, 230),
  ('openai',    'gpt-5.2-mini',       'GPT-5.2 mini (your key)',      'chat', 0.25,  2.0, 1, 'paid', true, true, 240),
  ('google',    'gemini-3-pro',       'Gemini 3 Pro (your key)',      'chat', 1.25, 10.0, 1, 'paid', true, true, 250),
  ('google',    'gemini-3-flash',     'Gemini 3 Flash (your key)',    'chat', 0.3,   2.5, 1, 'paid', true, true, 260)
on conflict (provider, model_id, kind) do update set
  display_name      = excluded.display_name,
  input_price_m     = excluded.input_price_m,
  output_price_m    = excluded.output_price_m,
  credit_multiplier = excluded.credit_multiplier,
  tier              = excluded.tier,
  byok_only         = excluded.byok_only,
  enabled           = excluded.enabled,
  sort_order        = excluded.sort_order;

-- ===== DIRECT PROVIDERS (BYOK Transcribe - disabled per 0027) =====
insert into ai_models
  (provider, model_id, display_name, kind, price_per_min,
   credit_multiplier, tier, byok_only, enabled, sort_order)
values
  ('openai', 'whisper-1',              'Whisper (your key)',         'transcribe', 0.006, 1, 'paid', true, false, 200),
  ('openai', 'gpt-4o-mini-transcribe', 'GPT-4o mini STT (your key)', 'transcribe', 0.003, 1, 'paid', true, false, 210),
  ('google', 'gemini-3-flash',         'Gemini 3 Flash (your key)',  'transcribe', 0.002, 1, 'paid', true, false, 220)
on conflict (provider, model_id, kind) do update set
  display_name      = excluded.display_name,
  price_per_min     = excluded.price_per_min,
  credit_multiplier = excluded.credit_multiplier,
  tier              = excluded.tier,
  byok_only         = excluded.byok_only,
  enabled           = excluded.enabled,
  sort_order        = excluded.sort_order;
