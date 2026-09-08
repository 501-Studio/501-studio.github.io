-- Incremental release validation for the already-provisioned Dayboard v3 backend.
-- Applied and verified in the existing project. No owner records or keys are changed.
create or replace function dayboard_private.validate_journey_safety() returns trigger language plpgsql set search_path='' as $$
declare old_state jsonb; g jsonb; og jsonb; category_name text; old_record jsonb; record jsonb; old_item jsonb; item jsonb; eligible boolean; target_day date; week_day date; event_count integer; category_count integer; total_xp integer; zone_cost integer; zone_id text;
begin
 old_state:=case when tg_op='UPDATE' then old.state else '{"items":[],"settings":{}}'::jsonb end;
 g:=coalesce(new.state->'settings'->'adventure','{}'::jsonb);og:=coalesce(old_state->'settings'->'adventure','{}'::jsonb);
 foreach category_name in array array['purchases','claims','redemptions'] loop
  for old_record in select value from jsonb_array_elements(coalesce(og->category_name,'[]'::jsonb)) loop
   if not exists(select 1 from jsonb_array_elements(coalesce(g->category_name,'[]'::jsonb)) x where x=old_record) then raise exception 'GAME_HISTORY_IMMUTABLE'; end if;
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(new.state->'items') loop
  if jsonb_typeof(coalesce(item->'routinePaused','false'::jsonb)) is distinct from 'boolean' then raise exception 'INVALID_ROUTINE_PAUSE'; end if;
  if coalesce((item->>'routinePaused')::boolean,false) and item->'repeatRule' is not null and item->'repeatRule'<>'null'::jsonb then
   select value into old_item from jsonb_array_elements(old_state->'items') x where x->>'id'=item->>'id';
   for record in select value from jsonb_array_elements(coalesce(item->'checkins','[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(coalesce(old_item->'checkins','[]'::jsonb)) x where x=record) then raise exception 'ROUTINE_PAUSED'; end if;
   end loop;
  end if;
 end loop;
 for record in select value from jsonb_array_elements(coalesce(g->'claims','[]'::jsonb)) loop
  if exists(select 1 from jsonb_array_elements(coalesce(og->'claims','[]'::jsonb)) x where x=record) then continue; end if;
  target_day:=(record->>'day')::date;week_day:=target_day-(extract(isodow from target_day)::integer-1);eligible:=false;
  if record->>'id'='day:'||target_day::text then
   select count(*) into event_count from jsonb_each(new.state->'settings'->'activity') e where coalesce((e.value->>'active')::boolean,false) and e.value->>'day'=target_day::text;
   eligible:=event_count>=3;
  elsif record->>'id'='reflect:'||week_day::text then
   eligible:=exists(select 1 from jsonb_each(coalesce(new.state->'settings'->'reflections','{}'::jsonb)) e where e.key::date>=week_day and e.key::date<week_day+7 and length(trim(coalesce(e.value->>'win','')||coalesce(e.value->>'next','')||coalesce(e.value->>'friction','')))>0);
  else
   select count(*),count(distinct e.value->>'category') into event_count,category_count from jsonb_each(new.state->'settings'->'activity') e where coalesce((e.value->>'active')::boolean,false) and (e.value->>'day')::date>=week_day and (e.value->>'day')::date<week_day+7;
   if record->>'id'='week:'||week_day::text then eligible:=event_count>=12;
   elsif record->>'id'='balance:'||week_day::text then eligible:=category_count>=3;end if;
  end if;
  if eligible is distinct from true then raise exception 'QUEST_NOT_READY';end if;
 end loop;
 if g ? 'motion' and jsonb_typeof(g->'motion') is distinct from 'boolean' then raise exception 'INVALID_MOTION';end if;
 if jsonb_typeof(coalesce(g->'visits','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(g->'visits','[]'::jsonb))>6 then raise exception 'INVALID_VISITS';end if;
 if (select count(distinct value) from jsonb_array_elements(coalesce(g->'visits','[]'::jsonb)))<>jsonb_array_length(coalesce(g->'visits','[]'::jsonb)) then raise exception 'INVALID_VISITS';end if;
 select coalesce(sum((e.value->>'xp')::integer),0) into total_xp from jsonb_each(new.state->'settings'->'activity') e where coalesce((e.value->>'active')::boolean,false) and (e.value->>'day')::date<=(now() at time zone 'Asia/Seoul')::date;
 total_xp:=total_xp+100*(select count(*) from jsonb_array_elements(new.state->'items') i where i->>'kind'='project' and i->>'status'='done');
 for zone_id in select value from jsonb_array_elements_text(coalesce(g->'visits','[]'::jsonb)) union select coalesce(g->>'zone','trail') loop
  zone_cost:=case zone_id when 'trail' then 0 when 'grove' then 150 when 'bridge' then 400 when 'lake' then 800 when 'observatory' then 1400 when 'summit' then 2400 else null end;
  if zone_cost is null then raise exception 'INVALID_ZONE';end if;
  if zone_cost>total_xp and not coalesce(og->'visits','[]'::jsonb)?zone_id and coalesce(og->>'zone','trail')<>zone_id then raise exception 'ZONE_LOCKED';end if;
 end loop;
 return new;
end $$;
revoke all on function dayboard_private.validate_journey_safety() from public,anon,authenticated;
-- On a new target with the v3 schema already installed, create this trigger once:
-- create trigger zzz_validate_journey_safety before insert or update of state on dayboard_private.workspaces for each row execute function dayboard_private.validate_journey_safety();
