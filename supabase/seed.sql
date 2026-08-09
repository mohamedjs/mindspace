-- ============================================================
-- MindSpace Seed Data
-- ============================================================

-- Seed AI models
insert into ai_models
 (provider, model_id, display_name, kind, input_price_m, output_price_m,
  price_per_min, credit_multiplier, is_default, tier, enabled, sort_order)
values
 -- ===== TEXT =====
 ('openrouter','deepseek/deepseek-v4-flash','DeepSeek V4 Flash','chat',
   0.140, 0.280, null, 1.0, true,  'free', true, 10),
 ('openrouter','qwen/qwen3.7-flash','Qwen 3.7 Flash','chat',
   0.030, 0.130, null, 0.5, false, 'free', true, 20),
 ('openrouter','google/gemini-3.1-flash-lite-preview','Gemini 3.1 Flash Lite','chat',
   0.250, 1.500, null, 1.5, false, 'free', true, 30),
 ('openrouter','moonshotai/kimi-k2.5','Kimi K2.5','chat',
   0.570, 2.850, null, 3.0, false, 'paid', true, 40),
 ('openrouter','z-ai/glm-5','GLM-5','chat',
   0.950, 2.550, null, 3.0, false, 'paid', true, 50),

 -- ===== SPEECH-TO-TEXT =====
 -- OpenRouter serves no /audio/transcriptions endpoint, so transcription runs
 -- through chat with an input_audio part and the model must decode the container
 -- we record (m4a on native, webm on web). Every model below was tested against
 -- a real m4a and returned a transcript. Whisper, Voxtral-transcribe and
 -- Qwen-ASR are not on OpenRouter at all; gpt-audio-mini, voxtral-small and
 -- nemotron-omni all returned HTTP 400 on m4a. Do not add them back untested.
 ('openrouter','google/gemini-2.5-flash','Gemini 2.5 Flash','transcribe',
   null, null, 0.0010, 1.0, true,  'free', true, 10),
 ('openrouter','google/gemini-2.5-flash-lite','Gemini 2.5 Flash Lite (cheapest)','transcribe',
   null, null, 0.0003, 0.5, false, 'free', true, 20),
 ('openrouter','google/gemini-3.1-flash-lite-preview','Gemini 3.1 Flash Lite','transcribe',
   null, null, 0.0005, 0.7, false, 'free', true, 30),
 ('openrouter','google/gemini-3-flash-preview','Gemini 3 Flash','transcribe',
   null, null, 0.0010, 1.0, false, 'free', true, 40),
 ('openrouter','google/gemini-2.5-pro','Gemini 2.5 Pro (most accurate)','transcribe',
   null, null, 0.0013, 1.5, false, 'paid', true, 50);
