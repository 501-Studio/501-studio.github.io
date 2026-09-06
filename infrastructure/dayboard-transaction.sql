-- Deployed repair for the existing Dayboard backend, 2026-09-06.
-- This is not a complete fresh-project schema or a credential provisioning script.
-- Renamed PL/pgSQL variables prevent ambiguous id predicates on real writes.
-- The original transaction snapshot protects fixed blocks against unlock/move chains.
create or replace function dayboard_private.apply(p_workspace uuid,p_base_revision bigint,p_operations jsonb,p_approved boolean,p_source text default 'app') returns jsonb language plpgsql security definer set search_path='' as $$
declare ws dayboard_private.workspaces; next_state jsonb; op jsonb; collection_name text; next_item jsonb; old_item jsonb; op_id text; parent_item jsonb; child_count integer; done_count integer; progress_value integer;
begin
 if p_approved is distinct from true then raise exception 'APPROVAL_REQUIRED'; end if;
 if jsonb_typeof(p_operations) is distinct from 'array' or jsonb_array_length(p_operations) not between 1 and 500 then raise exception 'INVALID_OPERATIONS'; end if;
 select w.* into ws from dayboard_private.workspaces w where w.id=p_workspace for update;
 if ws.id is null then raise exception 'NOT_FOUND'; end if;
 if ws.revision<>p_base_revision then raise exception 'VERSION_CONFLICT'; end if;
 next_state:=ws.state;
 for op in select value from jsonb_array_elements(p_operations) loop
  collection_name:=op->>'collection';
  if collection_name='settings' and op->>'action'='merge' then
   next_state:=jsonb_set(next_state,'{settings}',(next_state->'settings')||(op->'data')); continue;
  end if;
  if collection_name not in ('items','blocks') or collection_name is null then raise exception 'INVALID_COLLECTION'; end if;
  op_id:=coalesce(op->>'id',op->'data'->>'id'); perform op_id::uuid;
  if op_id is null then raise exception 'ID_REQUIRED'; end if;
  select value into old_item from jsonb_array_elements(next_state->collection_name) where value->>'id'=op_id;
  if p_source='chatgpt' and collection_name='blocks' and exists(select 1 from jsonb_array_elements(ws.state->'blocks') original where original->>'id'=op_id and coalesce((original->>'locked')::boolean,false) and (op->>'action'='delete' or op->'data'->>'locked'='false' or (op->'data'->>'start' is not null and (op->'data'->>'start')::timestamptz<>(original->>'start')::timestamptz) or (op->'data'->>'end' is not null and (op->'data'->>'end')::timestamptz<>(original->>'end')::timestamptz))) then raise exception 'LOCKED_EVENT'; end if;
  if op->>'action'='upsert' then
   next_item:=coalesce(old_item,'{}'::jsonb)||coalesce(op->'data','{}'::jsonb)||jsonb_build_object('id',op_id,'updatedAt',now());
   if old_item is null then next_item:=jsonb_build_object('createdAt',now())||next_item; end if;
   if collection_name='items' then
    next_item:='{"kind":"task","parentId":null,"deadline":null,"estimatedMinutes":30,"importance":2,"urgency":2,"category":"일반","recurrence":"none","progress":0,"status":"todo","notes":"","completedAt":null}'::jsonb||next_item;
    if next_item->>'status'='done' then next_item:=next_item||jsonb_build_object('progress',100,'completedAt',coalesce(old_item->>'completedAt',next_item->>'completedAt',now()::text));
    elsif coalesce((next_item->>'progress')::integer,0)>=100 then next_item:=next_item||jsonb_build_object('status','done','completedAt',coalesce(old_item->>'completedAt',now()::text));
    else next_item:=next_item||jsonb_build_object('completedAt',null); end if;
   else next_item:='{"taskId":null,"source":"app","locked":false,"allDay":false}'::jsonb||next_item; end if;
   next_state:=jsonb_set(next_state,array[collection_name],coalesce((select jsonb_agg(value) from jsonb_array_elements(next_state->collection_name) where value->>'id'<>op_id),'[]'::jsonb)||jsonb_build_array(next_item));
  elsif op->>'action'='delete' then
   next_state:=jsonb_set(next_state,array[collection_name],coalesce((select jsonb_agg(value) from jsonb_array_elements(next_state->collection_name) where value->>'id'<>op_id),'[]'::jsonb));
  else raise exception 'INVALID_ACTION'; end if;
 end loop;
 for parent_item in select value from jsonb_array_elements(next_state->'items') where value->>'kind' in ('task','project') order by case when value->>'kind'='task' then 0 else 1 end loop
  select count(*),count(*) filter(where value->>'status'='done'),round(avg((value->>'progress')::numeric)) into child_count,done_count,progress_value from jsonb_array_elements(next_state->'items') where value->>'parentId'=parent_item->>'id';
  if child_count>0 then
   parent_item:=parent_item||jsonb_build_object('progress',progress_value,'status',case when child_count=done_count then 'done' when progress_value>0 then 'doing' else 'todo' end,'completedAt',case when child_count=done_count then coalesce(parent_item->>'completedAt',now()::text) else null end);
   next_state:=jsonb_set(next_state,'{items}',(select jsonb_agg(case when value->>'id'=parent_item->>'id' then parent_item else value end) from jsonb_array_elements(next_state->'items')));
  end if;
 end loop;
 perform dayboard_private.validate_state(next_state);
 insert into dayboard_private.audit(workspace_id,revision,source,operations,before_state) values(ws.id,ws.revision+1,left(p_source,40),p_operations,ws.state);
 update dayboard_private.workspaces w set state=next_state,revision=w.revision+1,updated_at=now() where w.id=ws.id;
 delete from dayboard_private.audit a where a.workspace_id=ws.id and a.id not in(select recent.id from dayboard_private.audit recent where recent.workspace_id=ws.id order by recent.created_at desc limit 30);
 return dayboard_private.snapshot(ws.id);
end $$;
revoke all on function dayboard_private.apply(uuid,bigint,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function dayboard_private.apply(uuid,bigint,jsonb,boolean,text) to service_role;
