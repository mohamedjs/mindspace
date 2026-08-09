-- ============================================================
-- MindSpace Migration 0015: Apply/Undo AI Action RPCs
-- ============================================================

-- Apply AI action: single transaction applying forward_patches for accepted items
create or replace function apply_ai_action(
  p_action_id uuid,
  p_accepted_item_ids uuid[]
) returns void
language plpgsql security definer as $$
declare
  v_item record;
  v_user uuid := auth.uid();
  v_action_user uuid;
  v_patch jsonb;
  v_note_id uuid;
begin
  -- Verify ownership
  select user_id into v_action_user from ai_actions where id = p_action_id;
  if v_action_user is null or v_action_user <> v_user then
    raise exception 'action not found or not owned';
  end if;

  -- Mark which items are accepted
  update ai_action_items
     set accepted = (id = any(p_accepted_item_ids))
   where ai_action_id = p_action_id;

  -- Apply forward_patch for each accepted item in sort_order
  for v_item in
    select * from ai_action_items
     where ai_action_id = p_action_id
       and accepted = true
     order by sort_order asc
  loop
    v_patch := v_item.forward_patch;

    if v_item.operation = 'create_note' then
      insert into sticky_notes (
        id, user_id, space_id, title, content, type, color,
        x, y, width, height, parent_id, source_type,
        recording_id, transcript_id, span_start, span_end, ai_action_id
      ) values (
        (v_patch->>'id')::uuid,
        v_user,
        (v_patch->>'space_id')::uuid,
        v_patch->>'title',
        v_patch->>'content',
        (v_patch->>'type')::note_type,
        v_patch->>'color',
        (v_patch->>'x')::real,
        (v_patch->>'y')::real,
        coalesce((v_patch->>'width')::real, 180),
        coalesce((v_patch->>'height')::real, 120),
        (v_patch->>'parent_id')::uuid,
        'ai'::source_type,
        (v_patch->>'recording_id')::uuid,
        (v_patch->>'transcript_id')::uuid,
        (v_patch->>'span_start')::int,
        (v_patch->>'span_end')::int,
        p_action_id
      );
      v_note_id := (v_patch->>'id')::uuid;

    elsif v_item.operation = 'create_relationship' then
      insert into relationships (
        id, user_id, space_id, from_note_id, to_note_id, type, created_by, ai_action_id
      ) values (
        (v_patch->>'id')::uuid,
        v_user,
        (v_patch->>'space_id')::uuid,
        (v_patch->>'from_note_id')::uuid,
        (v_patch->>'to_note_id')::uuid,
        (v_patch->>'type')::rel_type,
        'ai',
        p_action_id
      );
    end if;

    update ai_action_items set applied_at = now() where id = v_item.id;
  end loop;

  -- Update action status
  if array_length(p_accepted_item_ids, 1) = (
    select count(*) from ai_action_items where ai_action_id = p_action_id
  ) then
    update ai_actions set status = 'accepted', resolved_at = now() where id = p_action_id;
  elsif array_length(p_accepted_item_ids, 1) > 0 then
    update ai_actions set status = 'partially_accepted', resolved_at = now() where id = p_action_id;
  else
    update ai_actions set status = 'rejected', resolved_at = now() where id = p_action_id;
  end if;
end $$;

-- Undo AI action: replay inverse_patches in reverse order
create or replace function undo_ai_action(p_action_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_item record;
  v_user uuid := auth.uid();
  v_action_user uuid;
  v_patch jsonb;
begin
  select user_id into v_action_user from ai_actions where id = p_action_id;
  if v_action_user is null or v_action_user <> v_user then
    raise exception 'action not found or not owned';
  end if;

  -- Replay inverse_patch in reverse sort_order
  for v_item in
    select * from ai_action_items
     where ai_action_id = p_action_id
       and accepted = true
       and applied_at is not null
     order by sort_order desc
  loop
    v_patch := v_item.inverse_patch;

    if v_item.operation = 'create_note' then
      -- Inverse of create is soft-delete
      update sticky_notes set deleted_at = now()
       where id = (v_patch->>'id')::uuid and user_id = v_user;

    elsif v_item.operation = 'create_relationship' then
      -- Inverse of create is soft-delete
      update relationships set deleted_at = now()
       where id = (v_patch->>'id')::uuid and user_id = v_user;
    end if;

    update ai_action_items set applied_at = null where id = v_item.id;
  end loop;

  update ai_actions set status = 'undone', resolved_at = now() where id = p_action_id;
end $$;
