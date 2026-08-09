-- ============================================================
-- MindSpace Migration 0018: Publish recordings to realtime
-- ============================================================
--
-- useRecordingStatus subscribes to postgres_changes on a single recordings row
-- to drive the recorded -> transcribing -> transcribed banner. Nothing was ever
-- added to the supabase_realtime publication, so that subscription never
-- received an event: the hook seeded 'recorded' from its initial select and the
-- banner then sat on "Saved on device…" forever, even after notes had landed.
--
-- RLS still applies to realtime, so a client only receives rows its "own"
-- policy already lets it select.

alter publication supabase_realtime add table recordings;

-- The UPDATE payload must carry the columns the client reads (status, error),
-- not just the primary key.
alter table recordings replica identity full;
