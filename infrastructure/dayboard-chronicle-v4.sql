-- Additive Chronicle 4.0 migration. Does not update workspace rows or credentials.
create or replace function dayboard_private.chronicle_realms() returns jsonb language sql immutable set search_path='' as $$
 select '[{"id":"harbor","hour":0,"end":30},{"id":"library","hour":40,"end":80},{"id":"bridge","hour":90,"end":140},{"id":"mirror","hour":150,"end":220},{"id":"desert","hour":230,"end":310},{"id":"crystal","hour":320,"end":410},{"id":"cloud","hour":420,"end":520},{"id":"snow","hour":530,"end":640},{"id":"tide","hour":650,"end":760},{"id":"stars","hour":770,"end":870},{"id":"garden","hour":880,"end":940},{"id":"dawn","hour":950,"end":1000}]'::jsonb;
$$;
create or replace function dayboard_private.chronicle_catalog() returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg('chron-'||(r.value->>'id')||'-'||s.slot,jsonb_build_object('slot',s.slot,'value','chron-'||(r.value->>'id'),'realm',r.value->>'id','hours',(r.value->>'hour')::int,'chapter',(r.ordinality-1)*8,'price',s.base+(r.ordinality-1)*40,'level',1+(r.ordinality-1)*3))
 from jsonb_array_elements(dayboard_private.chronicle_realms()) with ordinality r(value,ordinality)
 cross join (values ('outfit',60),('pet',85),('scene',120),('aura',90),('title',50),('relic',100)) s(slot,base);
$$;
-- Preserve every original product and its price. Extend, rather than replace, the catalog.
do $catalog$
declare combined jsonb; definition text;
begin
 combined:=dayboard_private.journey_catalog()||dayboard_private.chronicle_catalog();
 execute format('create or replace function dayboard_private.journey_catalog() returns jsonb language sql immutable set search_path='''' as %L', 'select '||quote_literal(combined::text)||'::jsonb;');
 definition:=pg_get_functiondef('dayboard_private.validate_journey_v3()'::regprocedure);
 if position('jsonb_array_length(purchases)>12' in definition)>0 then definition:=replace(definition,'jsonb_array_length(purchases)>12','jsonb_array_length(purchases)>84');
 elsif position('jsonb_array_length(purchases)>84' in definition)=0 then raise exception 'UNEXPECTED_CATALOG_VALIDATOR';end if;
 if position('array[''outfit'',''pet'',''scene'',''aura'',''title'']' in definition)>0 then definition:=replace(definition,'array[''outfit'',''pet'',''scene'',''aura'',''title'']','array[''outfit'',''pet'',''scene'',''aura'',''title'',''relic'']');
 elsif position('array[''outfit'',''pet'',''scene'',''aura'',''title'',''relic'']' in definition)=0 then raise exception 'UNEXPECTED_EQUIPMENT_VALIDATOR';end if;
 execute definition;
end $catalog$;
create or replace function dayboard_private.chronicle_metrics(s jsonb) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('minutes',coalesce(sum(greatest(0,(v->>'minutes')::numeric)),0),'completed',count(*),'routine',count(*) filter(where v->>'kind'='routine'),'days',count(distinct v->>'day'),
 'reflections',(select count(*) from jsonb_each(coalesce(s->'settings'->'reflections','{}'::jsonb)) x where x.key::date<=(now() at time zone 'Asia/Seoul')::date and length(trim(coalesce(x.value->>'win','')||coalesce(x.value->>'friction','')||coalesce(x.value->>'next','')))>0),
 'collection',jsonb_array_length(coalesce(s->'settings'->'adventure'->'purchases','[]'::jsonb)))
 from jsonb_each(coalesce(s->'settings'->'activity','{}'::jsonb)) e(k,v) where coalesce((v->>'active')::boolean,false) and (v->>'day')::date<=(now() at time zone 'Asia/Seoul')::date;
$$;
create or replace function dayboard_private.chronicle_title_ready(p_id text,s jsonb,m jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare realm jsonb; idx integer; amount integer; c jsonb:=coalesce(s->'settings'->'chronicle','{}'::jsonb);ready boolean:=false;
begin
 for realm,idx in select r.value,(r.ordinality-1)::int from jsonb_array_elements(dayboard_private.chronicle_realms()) with ordinality r(value,ordinality) loop
  if p_id='ending-'||(realm->>'id') then return jsonb_array_length(coalesce(c->'chapters','[]'::jsonb))>=(idx+1)*8;end if;
  if p_id='missions-'||(realm->>'id') then return (select count(*) from jsonb_array_elements(coalesce(c->'missions','[]'::jsonb)) x where x->>'id' in ((realm->>'id')||'-survey',(realm->>'id')||'-signal',(realm->>'id')||'-archive'))=3;end if;
 end loop;
 if p_id ~ '^hours-[0-9]+$' then amount:=substring(p_id from 7)::int;return amount=any(array[1,5,10,25,50,100,200,350,500,700,900,1000]) and (m->>'minutes')::numeric>=amount*60;end if;
 if p_id ~ '^collection-[0-9]+$' then amount:=substring(p_id from 12)::int;return amount=any(array[1,3,6,10,15,20,30,40,50,60,70,84]) and (m->>'collection')::int>=amount;end if;
 if p_id ~ '^days-[0-9]+$' then amount:=substring(p_id from 6)::int;return amount=any(array[3,7,14,30,60,90]) and (m->>'days')::int>=amount;end if;
 if p_id ~ '^reflection-[0-9]+$' then amount:=substring(p_id from 12)::int;return amount=any(array[1,3,7,14,30,60]) and (m->>'reflections')::int>=amount;end if;
 return false;
end $$;
create or replace function dayboard_private.validate_chronicle_v4() returns trigger language plpgsql set search_path='' as $$
declare prior jsonb; c jsonb; oc jsonb; m jsonb; realm jsonb; record jsonb; old_record jsonb; field text; record_limit integer; n integer; ri integer; ci integer; hours_needed integer; chapter_count integer; old_chapter_count integer; id text; subtype text; metric text; needed integer; role text; tier integer; catalog jsonb; product jsonb; new_purchases jsonb; old_purchases jsonb;
begin
 prior:=case when tg_op='UPDATE' then old.state else '{"settings":{},"items":[],"blocks":[]}'::jsonb end;
 c:=coalesce(new.state->'settings'->'chronicle','{}'::jsonb);oc:=coalesce(prior->'settings'->'chronicle','{}'::jsonb);
 if jsonb_typeof(c) is distinct from 'object' or (c ? 'version' and c->'version' is distinct from '1'::jsonb) then raise exception 'CHRONICLE_VERSION';end if;
 foreach field in array array['chapters','missions','titles'] loop
  record_limit:=case field when 'chapters' then 96 when 'missions' then 36 else 60 end;
  if jsonb_typeof(coalesce(c->field,'[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(c->field,'[]'::jsonb))>record_limit then raise exception 'CHRONICLE_RECORDS';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(c->field,'[]'::jsonb)) x group by x->>'id' having count(*)>1) then raise exception 'CHRONICLE_DUPLICATE';end if;
  for old_record in select value from jsonb_array_elements(coalesce(oc->field,'[]'::jsonb)) loop
   if not exists(select 1 from jsonb_array_elements(coalesce(c->field,'[]'::jsonb)) x where x=old_record) then raise exception 'CHRONICLE_HISTORY_IMMUTABLE';end if;
  end loop;
  for record in select value from jsonb_array_elements(coalesce(c->field,'[]'::jsonb)) loop
   if jsonb_typeof(record) is distinct from 'object' or record->>'id' is null or record->>'at' is null or jsonb_typeof(record->'at') is distinct from 'string' or (record->>'at')::timestamptz>now()+interval '1 minute' then raise exception 'CHRONICLE_TIME';end if;
  end loop;
 end loop;
 m:=dayboard_private.chronicle_metrics(new.state);
 chapter_count:=jsonb_array_length(coalesce(c->'chapters','[]'::jsonb));old_chapter_count:=jsonb_array_length(coalesce(oc->'chapters','[]'::jsonb));
 for record,n in select r.value,r.ordinality::int from jsonb_array_elements(coalesce(c->'chapters','[]'::jsonb)) with ordinality r(value,ordinality) loop
  ri:=(n-1)/8;ci:=(n-1)%8;realm:=dayboard_private.chronicle_realms()->ri;
  if record->>'id' is distinct from (realm->>'id')||'-'||(ci+1)::text or coalesce(record->>'choice','') not in ('a','b') then raise exception 'CHRONICLE_ORDER';end if;
  hours_needed:=case when ri=0 then (array[0,1,3,6,10,15,22,30])[ci+1] else round((realm->>'hour')::numeric+((realm->>'end')::numeric-(realm->>'hour')::numeric)*ci/7)::int end;
  if n>old_chapter_count and (m->>'minutes')::numeric<hours_needed*60 then raise exception 'CHRONICLE_LOCKED';end if;
 end loop;
 for record in select value from jsonb_array_elements(coalesce(c->'missions','[]'::jsonb)) loop
  id:=record->>'id';select r.value,(r.ordinality-1)::int into realm,ri from jsonb_array_elements(dayboard_private.chronicle_realms()) with ordinality r(value,ordinality) where id in ((r.value->>'id')||'-survey',(r.value->>'id')||'-signal',(r.value->>'id')||'-archive');
  if realm is null then raise exception 'CHRONICLE_MISSION';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(oc->'missions','[]'::jsonb)) x where x=record) then continue;end if;
  subtype:=split_part(id,'-',2);metric:=case subtype when 'survey' then 'completed' when 'signal' then 'routine' else 'reflections' end;needed:=case subtype when 'survey' then 3+ri*12 when 'signal' then 2+ri*6 else 1+ri*3 end;
  if (m->>'minutes')::numeric<(realm->>'hour')::int*60 or chapter_count<ri*8+(case subtype when 'survey' then 1 when 'signal' then 3 else 5 end) or (m->>metric)::int<needed then raise exception 'CHRONICLE_MISSION_LOCKED';end if;
 end loop;
 for record in select value from jsonb_array_elements(coalesce(c->'titles','[]'::jsonb)) loop
  if exists(select 1 from jsonb_array_elements(coalesce(oc->'titles','[]'::jsonb)) x where x=record) then continue;end if;
  if not dayboard_private.chronicle_title_ready(record->>'id',new.state,m) then raise exception 'CHRONICLE_TITLE_LOCKED';end if;
 end loop;
 if coalesce(c->>'equippedTitle','none')<>'none' and not exists(select 1 from jsonb_array_elements(coalesce(c->'titles','[]'::jsonb)) x where x->>'id'=c->>'equippedTitle') then raise exception 'CHRONICLE_TITLE_OWNERSHIP';end if;
 if coalesce(c->>'role','seeker') not in ('seeker','scribe','keeper') then raise exception 'CHRONICLE_ROLE';end if;
 select r.value,(r.ordinality-1)::int into realm,ri from jsonb_array_elements(dayboard_private.chronicle_realms()) with ordinality r(value,ordinality) where r.value->>'id'=coalesce(c->>'camp','harbor');
 if realm is null then raise exception 'CHRONICLE_CAMP';end if;
 if coalesce(c->>'camp','harbor')<>coalesce(oc->>'camp','harbor') and ((m->>'minutes')::numeric<(realm->>'hour')::int*60 or chapter_count<ri*8) then raise exception 'CHRONICLE_CAMP_LOCKED';end if;
 if jsonb_typeof(coalesce(c->'talents','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(c->'talents','[]'::jsonb))>least(18,chapter_count/4) or (select count(distinct value) from jsonb_array_elements(coalesce(c->'talents','[]'::jsonb)))<>jsonb_array_length(coalesce(c->'talents','[]'::jsonb)) then raise exception 'CHRONICLE_TALENT_POINTS';end if;
 for id in select value from jsonb_array_elements_text(coalesce(oc->'talents','[]'::jsonb)) loop if not coalesce(c->'talents','[]'::jsonb)?id then raise exception 'CHRONICLE_TALENT_HISTORY';end if;end loop;
 for id in select value from jsonb_array_elements_text(coalesce(c->'talents','[]'::jsonb)) loop
  if id !~ '^(seeker|scribe|keeper)-[1-6]$' then raise exception 'CHRONICLE_TALENT';end if;role:=split_part(id,'-',1);tier:=split_part(id,'-',2)::int;
  if tier>1 and not coalesce(c->'talents','[]'::jsonb)?(role||'-'||(tier-1)::text) then raise exception 'CHRONICLE_TALENT_ORDER';end if;
 end loop;
 catalog:=dayboard_private.chronicle_catalog();new_purchases:=coalesce(new.state->'settings'->'adventure'->'purchases','[]'::jsonb);old_purchases:=coalesce(prior->'settings'->'adventure'->'purchases','[]'::jsonb);
 for record in select value from jsonb_array_elements(new_purchases) loop
  product:=catalog->(record->>'id');if product is null or exists(select 1 from jsonb_array_elements(old_purchases) x where x->>'id'=record->>'id') then continue;end if;
  if (m->>'minutes')::numeric<(product->>'hours')::int*60 or chapter_count<(product->>'chapter')::int then raise exception 'CHRONICLE_SHOP_LOCKED';end if;
 end loop;
 return new;
end $$;
drop trigger if exists zzzz_validate_chronicle_v4 on dayboard_private.workspaces;
create trigger zzzz_validate_chronicle_v4 before insert or update of state on dayboard_private.workspaces for each row execute function dayboard_private.validate_chronicle_v4();
revoke all on function dayboard_private.chronicle_realms(),dayboard_private.chronicle_catalog(),dayboard_private.chronicle_metrics(jsonb),dayboard_private.chronicle_title_ready(text,jsonb,jsonb),dayboard_private.validate_chronicle_v4() from public,anon,authenticated;
comment on function dayboard_private.validate_chronicle_v4() is 'Chronicle unlocks use active completion estimated minutes, not measured focus time. Preserves saved history and rejects unearned new actions.';
