-- Additive metadata validation and pin protection. No owner rows/keys are changed.
create or replace function dayboard_private.validate_dashboard_metadata() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; field text; value jsonb;
begin
 for item in select x.value from jsonb_array_elements(new.state->'items') x loop
  if item ? 'pinned' and jsonb_typeof(item->'pinned') not in ('boolean','null') then raise exception 'INVALID_PIN'; end if;
  foreach field in array array['pinIndex','recommendationRank'] loop
   value:=item->field;
   if value is not null and jsonb_typeof(value)<>'null' then
    if jsonb_typeof(value)<>'number' then raise exception 'INVALID_PRIORITY_RANK'; end if;
    if (value::text)::numeric not between 0 and 3999 or trunc((value::text)::numeric)<>(value::text)::numeric then raise exception 'INVALID_PRIORITY_RANK'; end if;
   end if;
  end loop;
  if nullif(item->>'recommendationAt','') is not null then perform (item->>'recommendationAt')::timestamptz; end if;
 end loop;
 value:=new.state->'settings'->'taskOrder';
 if value is not null and jsonb_typeof(value)<>'null' then
  if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>4000 then raise exception 'INVALID_TASK_ORDER'; end if;
  if exists(select 1 from jsonb_array_elements_text(value) e group by e.value having count(*)>1) then raise exception 'DUPLICATE_TASK_ORDER'; end if;
  for field in select jsonb_array_elements_text(value) loop
   if field is null then raise exception 'INVALID_TASK_ORDER'; end if;
   perform field::uuid;
  end loop;
 end if;
 return new;
end $$;
revoke all on function dayboard_private.validate_dashboard_metadata() from public,anon,authenticated;
create trigger validate_dashboard_metadata before insert or update of state on dayboard_private.workspaces for each row execute function dayboard_private.validate_dashboard_metadata();
DO $patch$
declare definition text; marker text:=' perform dayboard_private.validate_state(next_state);';
begin
 definition:=pg_get_functiondef('dayboard_private.apply(uuid,bigint,jsonb,boolean,text)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'EXPECTED_VALIDATION_MARKER_NOT_FOUND'; end if;
 definition:=replace(definition,marker,$guard$
 if p_source='chatgpt' and exists(
  select 1 from jsonb_array_elements(ws.state->'items') original
  join jsonb_array_elements(next_state->'items') proposed on proposed->>'id'=original->>'id'
  where original->>'pinned'='true' and (proposed->'pinned' is distinct from original->'pinned' or proposed->'pinIndex' is distinct from original->'pinIndex')
 ) then raise exception 'PINNED_ORDER'; end if;
 perform dayboard_private.validate_state(next_state);$guard$);
 execute definition;
end $patch$;
