-- Applied to the existing Dayboard backend. No personal rows/keys in source.
-- Core invariants must be checked even when an authorized connector uses direct SQL.
create or replace function dayboard_private.enforce_state_integrity()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform dayboard_private.validate_state(new.state);
 return new;
end $$;
revoke all on function dayboard_private.enforce_state_integrity() from public,anon,authenticated;
grant execute on function dayboard_private.enforce_state_integrity() to service_role;
drop trigger if exists zzzz_validate_state_integrity on dayboard_private.workspaces;
create trigger zzzz_validate_state_integrity
before insert or update of state on dayboard_private.workspaces
for each row execute function dayboard_private.enforce_state_integrity();
-- A separate owner-authorized repair changed only two leaf kind fields (task -> subtask),
-- with the previous state in the private audit table and an incremented revision.
-- Never relax this validator, detach tasks or delete data to silence INVALID_PARENT.
