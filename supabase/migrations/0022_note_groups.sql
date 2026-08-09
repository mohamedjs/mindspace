-- ============================================================
-- MindSpace Migration 0022: Note groups (titled frames on the board)
-- ============================================================
-- A group is a labelled rectangle drawn behind the notes — "Marketing",
-- "Next sprint", "Rejected". Membership is spatial (whatever sits inside the
-- rectangle) rather than a foreign key: notes move freely and a group is a
-- visual container, not an owner. That keeps drag-into-a-group free of any
-- write, and a deleted group never orphans a note.

create table note_groups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  space_id   uuid not null references spaces on delete cascade,
  title      text,
  x          real not null,
  y          real not null,
  width      real not null default 460,
  height     real not null default 360,
  color      text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index on note_groups (space_id) where deleted_at is null;

alter table note_groups enable row level security;

create policy "own" on note_groups for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
