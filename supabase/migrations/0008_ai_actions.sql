-- ============================================================
-- MindSpace Migration 0008: AI Actions
-- ============================================================

create table ai_actions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  space_id       uuid not null references spaces on delete cascade,
  kind           ai_action_kind not null,
  status         ai_action_status not null default 'pending',
  recording_id   uuid references recordings on delete set null,
  transcript_id  uuid references transcripts on delete set null,
  provider       provider_id not null,
  model_id       text not null,
  prompt_version text not null,
  billed_to      text not null default 'credits',
  credits_charged int not null default 0,
  input_tokens   int,
  output_tokens  int,
  raw_cost_usd   numeric(10,6),
  raw_response   jsonb,
  error          text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index on ai_actions (space_id, created_at desc);
create index on ai_actions (user_id, created_at desc);

-- One reversible mutation per item. Undo replays inverse_patch in reverse sort_order.
create table ai_action_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  ai_action_id  uuid not null references ai_actions on delete cascade,
  operation     text not null,
  target_type   text not null,
  target_id     uuid,
  forward_patch jsonb not null,
  inverse_patch jsonb not null,
  accepted      boolean not null default true,
  applied_at    timestamptz,
  sort_order    int not null default 0
);
create index on ai_action_items (ai_action_id, sort_order);
