# Dayboard 4.0 — Chronicle / 열두 대륙의 서사

Korean-first personal scheduler with a separate long-horizon Adventure. Production address: https://dayboard-501.onrender.com

Existing users keep the same site, connection key, schedule, Google settings, XP and purchased items. Refresh cached resources after deployment; do not create a replacement workspace. Never publish a personal connection file: it functions as a password.

## Scheduler

Today dashboard, detailed timeline, week/month calendar, project/task/subtask hierarchy, kanban, completion/undo, counted daily/weekly routines and weekdays, colors, statistics/reflection, user-approved plans, manual order and pins. Existing core validation, revision guards and local completion styling remain.

## Chronicle expansion

See CHRONICLE.md for full semantics and limits.

- 12 regional arcs; 96 authored short chapters; three reading steps and two locally different outcomes per chapter.
- Progression gates through 1,000 hours of **completed task estimates**, not measured focus or actual gameplay. No guarantee of 1,000 hours of unique play.
- 84 shop items total (12 original + 72 regional), six cosmetic slots and reversible previews. Original prices and purchase records are preserved.
- 60 free conditional titles; 36 regional missions; 48 mementos; three selectable roles and 18 narrative mastery nodes.
- Native text and controls, animated existing character artwork, region palette variants, contained tab navigation and desktop/mobile layouts.
- Old quests, six-region journey, wardrobe, personal rewards and achievement history remain accessible.

No paid model API, new subscription, cash shop, loot boxes or absence penalties were introduced. Free hosting/database limits still apply.

## Storage

The owner's existing Supabase workspace remains authoritative. Chronicle is additive settings metadata and is created only on an explicit user action. PostgreSQL enforces progression gates, immutable saved choices, mission evidence, title ownership, talent prerequisites, purchase costs/balance and stale revisions. Reading or playing story does not create schedule work or invent hours/XP. Task undo lowers current progress while preserving already saved story and ownership records.

Incremental infrastructure SQL assumes the existing Dayboard backend; it is not a general fresh-project installer and must not be applied to unrelated databases. No workspace keys or personal schedules are committed.

## Development and verification

```sh
cd dayboard
python3 -m http.server 4173
```

Use the explicitly labeled sample board for a no-credentials preview; sample changes are not personal cloud storage. The final workflow serves committed modules directly and does not generate or rewrite source at runtime. Browser tests use Playwright/Chromium and synthetic/mocked state; main additionally checks the live sample route. PostgreSQL checks ran on disposable synthetic workspaces. They do not verify a real Google OAuth/Calendar write or physical iPhone Safari session.

CHATGPT.md defines the proposal/approval connector flow. Render auto-deploys main; consult the actual release workflow and deploy status rather than assuming this README proves a live deployment.
