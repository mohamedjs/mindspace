-- ============================================================
-- MindSpace Migration 0009: Timeline + Triggers
-- ============================================================

create table timeline_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  space_id   uuid not null references spaces on delete cascade,
  type       text not null,
  ref_id     uuid,
  summary    text not null,
  created_at timestamptz not null default now()
);
create index on timeline_events (space_id, created_at desc);

-- Auto-write timeline events on note changes
create or replace function on_note_change() returns trigger
language plpgsql security definer as $$
declare v_type text; v_summary text;
begin
  if TG_OP = 'INSERT' then
    v_type := 'note_created';
    update spaces set note_count = note_count + 1, last_activity_at = now()
      where id = new.space_id;
  elsif TG_OP = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      v_type := 'note_deleted';
      update spaces set note_count = greatest(note_count - 1, 0) where id = new.space_id;
    elsif old.content is distinct from new.content or old.type is distinct from new.type then
      v_type := 'note_updated';
    else
      return new;  -- position-only change: no timeline noise
    end if;
    update spaces set last_activity_at = now() where id = new.space_id;
  end if;

  v_summary := coalesce(new.title, left(new.content, 60));
  insert into timeline_events (user_id, space_id, type, ref_id, summary)
  values (new.user_id, new.space_id, v_type, new.id, v_summary);
  return new;
end $$;

create trigger t_note_timeline after insert or update on sticky_notes
  for each row execute function on_note_change();

-- Auto-update updated_at on row change
create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger t_notes_touch before update on sticky_notes
  for each row execute function touch_updated_at();
create trigger t_spaces_touch before update on spaces
  for each row execute function touch_updated_at();
