# Dayboard 3.0

A Korean-first personal schedule board. The main dashboard stays quiet; richer analytics and game visuals live on separate pages. Production: https://dayboard-501.onrender.com

## Start

Existing users keep the same site, workspace connection and calendar settings. Refresh cached files when upgrading; do not create a replacement workspace. New connections use the existing setup assistant. Connection files are passwords: never publish them or attach them to a chat.

To run the static frontend locally:

```sh
cd dayboard
python3 -m http.server 4173
```

Use the explicitly labelled sample board for a no-credentials demonstration. It is not the owner's schedule and does not persist. The frontend has no model API or paid runtime package CDN. Google browser authorization uses the owner's separately registered OAuth client and consent.

## What changed

- Complete or undo tasks in today, week, month/date-detail and kanban. Linked blocks share the same task state.
- Daily 1–20 occurrences or weekly 1–99 occurrences, eligible weekday checkboxes, start date and pause. Weekly periods start Monday in Asia/Seoul. A routine remains an ongoing task; each completion records a separate occurrence.
- Colors for tasks, projects and blocks, with inheritance. Google event completion/color is a Dayboard-local annotation; changing the appointment itself still uses the existing Google write flow.
- Statistics for 7/30/90 days, comparisons, daily trend, category mix, weekdays, check-in hours, routine goals and 84-day activity. Completed estimated minutes are NOT tracked focus time. Reflection is explicitly saved; drafts survive app refreshes within the session.
- Adventure: animated original-concept character, motion toggle/reduced-motion support, earned XP/stars, six regions, four repeatable-scope quests, six achievement badges, 12 shop items, clothing color variants, companion, scenery, aura, title and user-defined real-life reward records. No cash purchases, loot boxes or absence penalties.

## Storage and integrity

The existing connected Supabase project remains the source of truth. RPC writes check workspace keys and revisions. Existing tables stay private; no credentials or personal schedules are committed in this public repository. Database triggers derive the activity ledger, reject duplicate/future/ineligible routine check-ins, validate shop prices/balance/ownership, prevent deletion of purchase/claim/redemption history and enforce quest/region requirements. Undo adjusts activity rewards; an already-spent balance may become negative and block further purchases.

The infrastructure folder contains incremental repairs to an already-provisioned backend, not a complete new-project installer. Never apply these SQL files to an unrelated project or reset an existing workspace key. Owner records and keys were not modified by release tests.

## Tests and release

`.github/dayboard-v2-domain.mjs` preserves 16 priority/planning checks. `tests/journey-release.cjs` runs 27 domain/browser checks against a synthetic mock workspace; main adds a real deployed-site sample test. Browser tests do not claim real Google consent or live Calendar writes. They exercise 1440/1024/768/390/320px, completion/undo, routine counts, reflection, shop/equip, rewards, second-client state and reduced motion. Seventeen separate real PostgreSQL checks passed on a disposable workspace.

The release workflow is read-only and serves committed files directly; no source generator runs in production. Render auto-deploys main. Free provider quotas/inactivity rules still apply. No paid subscription, model API, hosting upgrade or billing registration was introduced.

See CHATGPT.md for the connector workflow and JOURNEY.md for recurrence/statistics semantics.
