-- ============================================================
-- MindSpace Migration 0010: Row Level Security
-- ============================================================

-- Enable RLS on every table
alter table profiles            enable row level security;
alter table spaces              enable row level security;
alter table recordings          enable row level security;
alter table transcripts         enable row level security;
alter table sticky_notes        enable row level security;
alter table relationships       enable row level security;
alter table ai_actions          enable row level security;
alter table ai_action_items     enable row level security;
alter table timeline_events     enable row level security;
alter table user_ai_keys        enable row level security;
alter table credit_ledger       enable row level security;
alter table credit_reservations enable row level security;
alter table payments            enable row level security;
alter table credit_packages     enable row level security;

-- Full ownership on user data
create policy "own" on spaces        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on recordings    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on transcripts   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on sticky_notes  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on relationships for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on ai_actions    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on ai_action_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on timeline_events for select using (auth.uid() = user_id);
create policy "own" on user_ai_keys  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Money tables: READ ONLY from client. Writes via SECURITY DEFINER RPCs only.
create policy "read own" on profiles            for select using (auth.uid() = id);
create policy "update own prefs" on profiles    for update using (auth.uid() = id)
  with check (auth.uid() = id);
create policy "read own" on credit_ledger       for select using (auth.uid() = user_id);
create policy "read own" on credit_reservations for select using (auth.uid() = user_id);
create policy "read own" on payments            for select using (auth.uid() = user_id);
create policy "read all" on credit_packages     for select using (enabled);

-- Block direct credit tampering from client
create or replace function guard_profile_update() returns trigger
language plpgsql as $$
begin
  if new.credits_balance  is distinct from old.credits_balance
  or new.credits_reserved is distinct from old.credits_reserved then
    raise exception 'credits are read-only from the client';
  end if;
  return new;
end $$;

create trigger t_guard_profile before update on profiles
  for each row when (current_setting('role') = 'authenticated')
  execute function guard_profile_update();
