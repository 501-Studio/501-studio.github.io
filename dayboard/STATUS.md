# Dayboard 3.0.1

## Parent integrity hotfix

The reported whole-board INVALID_PARENT issue was traced to leaf records typed as task under a task parent. The owner-authorized data repair changed only those type labels to subtask. All other item fields, time blocks, settings, activity/rewards and credentials were asserted unchanged. The previous state remains in the private audit history. No private schedule or connection key was committed.

The database now enforces the existing core hierarchy/reference validator on every state insert/update, including direct SQL. The frontend shares a hierarchy preflight for local/cloud writes and proposals. Invalid data no longer marks the account as disconnected; the user sees an unsaved-change notice and Korean guidance. Successful identical-data refreshes clear stale network banners. Late reads cannot replace newer revisions. Conflicts fetch current state without auto-replaying stale changes.

## Verification

Fix-branch run 34178993920 passed 66 checks: 14 new hierarchy/store checks, 9 browser reproduction/recovery checks, 16 retained planning/priority checks and 27 retained v3 domain/browser checks. Main adds one real deployed-site sample check with the expected current version.

Fourteen independent PostgreSQL checks passed against a disposable private copy of the affected data, including completion/undo, adventure settings, reflections, invalid direct-write rejection, reference integrity, revision guards and unchanged access restrictions. The test copy and dependent records were removed. Owner data was not modified by QA beyond the separately authorized two-field repair.

Browser tests use Playwright/Chromium in GitHub Actions because the session has no Browser plugin and no local Chromium binary. Mocked browser RPC checks are distinct from the real PostgreSQL checks. Production verification uses sample mode; actual Google consent/calendar writes and a physical iPhone are not part of this hotfix validation.

## Preserved behavior

Today/week/month/board completion, counted daily/weekly routines, schedule colors, statistics/reflections, adventure/shop/customization, XP and backups remain. The same site and workspace key are used; no new workspace or Google reconnection is required by this patch. Reload cached application files after deployment.

Release CI is read-only, production serves committed source, and the temporary integration script was removed. No paid model API, subscription, hosting upgrade or billing change was introduced.

See HOTFIX-3.0.1.md for the diagnosis and CHATGPT.md for the approved connector workflow.
