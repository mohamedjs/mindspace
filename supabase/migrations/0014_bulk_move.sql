-- ============================================================
-- MindSpace Migration 0014: Bulk Move Notes RPC
-- ============================================================

create or replace function bulk_move_notes(
  p_moves jsonb  -- array of {id: uuid, x: real, y: real}
) returns void
language plpgsql security invoker as $$
declare v_move jsonb;
begin
  for v_move in select * from jsonb_array_elements(p_moves)
  loop
    update sticky_notes
       set x = (v_move->>'x')::real,
           y = (v_move->>'y')::real
     where id = (v_move->>'id')::uuid
       and user_id = auth.uid()
       and deleted_at is null;
  end loop;
end $$;
