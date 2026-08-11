-- ============================================================
-- MindSpace Migration 0027: BYOK is chat-only; voice stays on our credits
-- ============================================================
-- The split the product actually wants:
--
--   text -> sticky notes   runs on the user's own key, billed by their provider
--   voice -> text          always runs on our OpenRouter key, billed in credits
--
-- So "Your AI" is not a zero-credit plan after all. It needs an allowance big
-- enough to cover transcription, which is the only thing it still spends on.
-- Transcription costs 6 credits a minute, so 900 credits is about 150 minutes
-- of talking a month.

update subscription_plans
   set base_credits = 900,
       bonus_pct    = 0,
       tagline      = 'Your key for the thinking, our credits for the listening'
 where id = 'byok';

-- Transcription on a user's own key is withdrawn: every recording goes through
-- our OpenRouter key so the pipeline has one predictable path. Disabled rather
-- than deleted — profiles.transcribe_model_id may still reference these rows,
-- and resolveModel already skips anything not enabled.
update ai_models
   set enabled = false
 where byok_only
   and kind = 'transcribe';

-- Only three providers can back a user key, matching the key screen. Anything
-- else that ever got seeded as byok_only chat is switched off so the picker and
-- the server agree on the same short list.
update ai_models
   set enabled = false
 where byok_only
   and kind = 'chat'
   and provider not in ('openai', 'anthropic', 'google');
