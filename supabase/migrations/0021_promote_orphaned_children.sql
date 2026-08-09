-- ============================================================
-- MindSpace Migration 0021: Promote children when a parent note is deleted
-- ============================================================
-- sticky_notes.parent_id -> sticky_notes(id) on delete set null exists, but
-- deleteNote() and the ai_action undo path both do a SOFT delete
-- (deleted_at = now()) — the row is never actually dropped, so that FK
-- action never fires. Left alone, a child of a soft-deleted parent becomes
-- permanently invisible: not top-level (parent_id still points at a real
-- row) and unreachable (you can't navigate into a deleted parent).
--
-- A trigger is the root-cause fix: it covers both existing soft-delete
-- writers (the client's UPDATE and 0015's undo UPDATE) in one place instead
-- of duplicating the promotion logic in each caller.

create or replace function promote_children_on_soft_delete() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update sticky_notes set parent_id = null where parent_id = new.id;
  end if;
  return new;
end $$;

create trigger t_promote_children_on_soft_delete
  after update on sticky_notes
  for each row execute function promote_children_on_soft_delete();
