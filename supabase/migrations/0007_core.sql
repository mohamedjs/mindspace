-- ============================================================
-- MindSpace Migration 0007: Core Tables
-- (spaces, recordings, transcripts, sticky_notes, relationships)
-- ============================================================

create table spaces (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  emoji      text not null default '💡',
  canvas_zoom real not null default 1,
  canvas_x   real not null default 0,
  canvas_y   real not null default 0,
  note_count int not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on spaces (user_id, last_activity_at desc) where deleted_at is null;

create table recordings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  space_id     uuid not null references spaces on delete cascade,
  storage_path text,
  local_only   boolean not null default true,
  duration_ms  int not null,
  size_bytes   int,
  mime_type    text not null default 'audio/m4a',
  status       recording_status not null default 'recorded',
  error        text,
  created_at   timestamptz not null default now()
);
create index on recordings (space_id, created_at desc);

create table transcripts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  recording_id uuid not null references recordings on delete cascade,
  text         text not null,
  language     text,
  provider     provider_id not null,
  model_id     text not null,
  created_at   timestamptz not null default now()
);
create index on transcripts (recording_id);

create table sticky_notes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  space_id        uuid not null references spaces on delete cascade,
  title           text,
  content         text not null,
  type            note_type not null default 'idea',
  color           text,
  x               real not null,
  y               real not null,
  width           real not null default 180,
  height          real not null default 120,
  parent_id       uuid references sticky_notes on delete set null,
  z_index         int not null default 0,
  source_type     source_type not null default 'manual',
  recording_id    uuid references recordings on delete set null,
  transcript_id   uuid references transcripts on delete set null,
  span_start      int,
  span_end        int,
  ai_action_id    uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on sticky_notes (space_id) where deleted_at is null;
create index on sticky_notes (space_id, x, y);
create index on sticky_notes (parent_id);
create index on sticky_notes (recording_id);

create table relationships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  space_id     uuid not null references spaces on delete cascade,
  from_note_id uuid not null references sticky_notes on delete cascade,
  to_note_id   uuid not null references sticky_notes on delete cascade,
  type         rel_type not null default 'related',
  created_by   text not null default 'user',
  ai_action_id uuid,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint no_self_link check (from_note_id <> to_note_id)
);
create unique index rel_unique on relationships (from_note_id, to_note_id, type)
  where deleted_at is null;
