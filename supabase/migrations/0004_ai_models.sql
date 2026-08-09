-- ============================================================
-- MindSpace Migration 0004: AI Models
-- ============================================================
create table ai_models (
  id                uuid primary key default gen_random_uuid(),
  provider          provider_id not null,
  model_id          text not null,
  display_name      text not null,
  kind              model_kind not null,
  input_price_m     numeric(10,4),
  output_price_m    numeric(10,4),
  price_per_min     numeric(10,5),
  credit_multiplier numeric(6,2) not null default 1.0,
  is_default        boolean not null default false,
  byok_only         boolean not null default false,
  tier              text not null default 'free',
  enabled           boolean not null default true,
  notes             text,
  sort_order        int not null default 100,
  price_synced_at   timestamptz,
  unique (provider, model_id)
);

-- Add FK from profiles to ai_models
alter table profiles
  add constraint fk_chat_model      foreign key (chat_model_id)      references ai_models(id),
  add constraint fk_transcribe_model foreign key (transcribe_model_id) references ai_models(id);

-- ai_models is world-readable (public price list), nobody can write
alter table ai_models enable row level security;
create policy "read models" on ai_models for select to authenticated using (enabled);
