-- ============================================================
-- MindSpace Migration 0019: one model may serve more than one kind
-- ============================================================
--
-- ai_models had `unique (provider, model_id)`, which assumed a model does
-- exactly one job. That is false for multimodal models: google/gemini-* accept
-- both text and audio, so the same model_id is a legitimate `chat` row AND a
-- legitimate `transcribe` row. The old constraint made listing it for both
-- impossible.
--
-- kind is already part of every lookup (resolveModel filters on it), so widening
-- the key to include kind is the accurate uniqueness rule.

alter table ai_models drop constraint if exists ai_models_provider_model_id_key;
alter table ai_models add constraint ai_models_provider_model_id_kind_key
  unique (provider, model_id, kind);
