-- ============================================================
-- MindSpace Migration 0013: Storage Bucket
-- ============================================================

-- Create private recordings bucket with 25MB size limit
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 26214400, array['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav']);

-- RLS policies for storage: path-scoped to user_id
create policy "Users can upload own recordings"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own recordings"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own recordings"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
