# Dayboard 3.0.1 — whole-board INVALID_PARENT hotfix

## Diagnosis and repair

A stored board contained two leaf rows tagged `task` although their parent was a task. The RPC checked the whole state on every write; consequently unrelated completion, reflection and adventure operations all failed with `INVALID_PARENT`. Previously, direct SQL writes did not run that core validator.

An owner-authorized repair corrected only the two leaf kinds to `subtask`. It preserved every other item field, block, setting, activity/reward record and connection credential. The before-state was retained in the private audit table. No personal IDs, titles, dates, credentials or schedules are in this repository.

## Prevention and UI

- A final-row database trigger now invokes the existing core validator for all state INSERT/UPDATE paths, including direct connector SQL. It does not relax authentication, auto-detach tasks, delete data or silently coerce inputs.
- The client validates the complete proposed hierarchy before local/cloud writes and proposal creation. Parents and children created in one batch are checked together.
- Invalid data is reported as an unsaved change with Korean guidance, not a disconnected account. Network/read errors retain separate status.
- A successful refresh clears stale network warnings even when the returned data is unchanged. Late reads cannot overwrite a newer revision. Conflicting writes fetch the latest state and require retry; no stale write is automatically replayed.

## Verification scope

Fourteen PostgreSQL checks passed using a disposable private copy of the affected data: full validation, completion/undo, adventure settings, reflection, hierarchy creation, rejected direct invalid writes, orphan/reference protection, revision protection and unchanged table grants. The test copy was deleted. Owner data was not changed by QA.

`tests/parent-integrity.mjs` and `tests/parent-ui.cjs` cover a synthetic malformed-then-repaired board and recovery states. The existing journey and priority suites are retained. Browser/provider simulation is not a real Google Calendar write test. See the actual CI result for current pass/fail status. No paid service or subscription was introduced.
