# Dayboard

A Korean-first, readable personal schedule board. Desktop: navigation + daily/weekly work area + project/deadline rail. Mobile: prioritized vertical layout and bottom navigation. Native HTML/CSS/ES modules follow the existing static repository, with no runtime package CDN, build step, paid AI calls or new paid subscription.

## Run locally

```sh
cd dayboard
python3 -m http.server 4173
# Open http://localhost:4173
```

Deploy only this folder as a static site. Existing repository root files are preserved. No credentials or personal schedule content belong in this public repository.

## Implemented surfaces

- Today, weekly agenda, monthly calendar, kanban, project/task/subtask hierarchy.
- Task fields with defaults; manual time blocking; desktop drag/drop and mobile tap-to-edit.
- Conflict warnings; fixed-block protection; rule-based available-slot planning and overdue-block replanning with proposal/approval flow.
- Cloud snapshot persistence, optimistic revision checking, foreground 45-second polling and refresh on focus; no misleading offline-save state.
- Per-leaf XP, levels, project completion bonus, weekly goal and small badges; derived rewards prevent completion toggle farming.
- Recurrence on leaf completion (daily, weekdays, weekly, monthly); future instances are separate tasks and require time allocation.
- Task search, JSON backup/merge, proposal JSON review, recent change log, direct-edit undo and key rotation.
- ChatGPT integration via the user's existing Supabase connector: see CHATGPT.md. No global interception of ordinary conversations.
- Google browser read/write module with ETag conflict checks and mapping by calendar/event IDs. **OAuth client registration and user consent are not provisioned by this repository.** Access tokens remain only in memory, so refresh/expiry requires consent again. No always-on/background sync.

## Private backend

The connected Supabase project contains an isolated `dayboard_private` schema. Tables have RLS enabled and no anon/authenticated direct table grants. Browser RPC accepts a high-entropy workspace capability key, compares only its SHA-256 hash, and uses fixed-search-path private functions. Public RPC wrappers are SECURITY INVOKER. Each write checks the current revision, validates the resulting complete state, and stores a bounded before-state audit log. A key grants access to its single workspace: treat it like a password, do not send it through query strings, and rotate it if exposed.

Public client configuration (project URL and publishable API key) is intentionally public. It cannot read a workspace without its private key. Local browser storage contains the owner's private workspace key; do not use shared/public devices without disconnecting afterwards.

Browser endpoints:
- `dayboard_read(p_key)`
- `dayboard_apply(p_key, p_base_revision, p_operations, p_approved)`
- `dayboard_propose(p_key, p_base_revision, p_operations, p_title)`
- `dayboard_decide(p_key, p_proposal_id, p_approved)`
- `dayboard_rotate_key(p_key, p_new_key)`

ChatGPT uses the separately authorized connector to call private functions documented in CHATGPT.md, not the browser key.

## Costs and operational limits

Uses the existing Supabase Free organization. Intended for personal usage within free hosting/storage limits. No OpenAI API key or model endpoint exists in the code. No paid upgrade or billing registration is performed by the app. Providers may enforce quotas or pause inactive free projects; this is not unlimited hosting or a paid production SLA. Export backups regularly.

## Module map

- core.js: domain model, date arithmetic, store and planning.
- views.js: escaped semantic templates and responsive views.
- app.js: UI event orchestration, dialogs, mutations and approval.
- google.js: OAuth token flow and Google Calendar REST adapter.
- styles.css: readable responsive design system.
- CHATGPT.md: connector workflow and approval contract.

## Security notes

CSP disallows inline JavaScript, external code except Google Identity Services, object embedding and unexpected network destinations. User content is HTML-escaped. Workspace keys are not inserted in outbound URLs. No third-party trackers or analytics are included. Backups exclude the workspace key. The capability model is single-owner access, not multi-user identity/RBAC; no email/password authentication is claimed.
