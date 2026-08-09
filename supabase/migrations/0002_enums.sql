-- ============================================================
-- MindSpace Migration 0002: Enums
-- ============================================================
create type note_type as enum
  ('idea','task','question','decision','reference','thought','summary');

create type rel_type as enum
  ('related','depends_on','supports','contradicts','derived_from','child_of');

create type source_type as enum ('voice','manual','ai');

create type recording_status as enum
  ('recorded','uploading','transcribing','transcribed','failed');

create type ai_action_kind as enum
  ('extract_thoughts','detect_relations','thought_evolution','weekly_digest');

create type ai_action_status as enum
  ('pending','proposed','accepted','partially_accepted','rejected','undone','failed');

create type provider_id as enum
  ('openrouter','openai','google','anthropic','nvidia','custom');

create type model_kind as enum ('chat','transcribe');

create type ledger_reason as enum
  ('signup_grant','monthly_refill','purchase','usage','refund','reversal','admin_adjust');
