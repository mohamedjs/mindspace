-- ============================================================
-- MindSpace Migration 0023: When a note is for
-- ============================================================
-- Speech is full of times — "send the deck tomorrow at 3", "call him Sunday".
-- The extraction now resolves those against the speaker's timezone and writes
-- them here, which is what the calendar view groups by and what the reminder
-- scheduler reads. Null for the vast majority of notes: a thought has no date.

alter table sticky_notes add column due_at timestamptz;

create index on sticky_notes (space_id, due_at) where deleted_at is null;
