# Dayboard v3 data semantics

## Counted routines

`repeatRule = {mode:'daily'|'weekly', target:integer, days:[0..6], start:'YYYY-MM-DD'}`. Sunday is 0; weeks start Monday in Asia/Seoul. Daily target is 1–20; weekly target is 1–99. At least one eligible weekday is required. A daily 2 target on Monday–Friday means 2 EACH selected day; weekly 3 on Monday/Wednesday/Friday means 3 TOTAL across that week, not 3 each day. Pause uses `routinePaused:true` without deleting history.

An occurrence is `{id:'D:YYYY-MM-DD:1', period:'D:YYYY-MM-DD', slot:1, day:'YYYY-MM-DD', at:'ISO timestamp'}` or a weekly `W:MONDAY` period. IDs combine period and positive slot. When adding, use the first unused slot for that period; keep all existing records. Never exceed the target, use ineligible days or create future completions. Routine task status remains `todo`, progress 0, completedAt null: rendered status is derived from the selected period. Undo removes only the selected period's last occurrence. Do not clone a new task for each counted completion. Legacy recurrence remains available when repeatRule is null.

For a requested ChatGPT update, read the exact workspace from the app, preserve the existing checkins array and use the usual proposal/approval workflow. Do not forge completed progress, activity, rewards or shop inventory. `settings.activity` is derived by the server; direct client changes are ignored. Never run a key reset, permission change or direct-table override to resolve an error.

## Colors

`color` accepts null, indigo, sky, teal, green, amber, coral, rose or violet. A block without an explicit color inherits from its linked task/project. Color is display metadata, not importance or a diagnostic. Google original calendar colors are not overwritten.

## Statistics

Activity snapshots preserve the completed title, category, estimate, deadline, logged timestamp and reward. Parent/child work is not double counted. Deleting a completed task retains its historical entry; undo deactivates it. Date windows include their endpoints. Hours describe when the completion was CHECKED, not actual work duration. The time total sums estimated minutes of completed occurrences, not stopwatch measurements. Prior completion history can only be reconstructed from available records.

Reflection fields (`win`, `friction`, `next`, `energy`) are user-authored and saved explicitly. Recommendations are deterministic prompts derived from statistics, not personality diagnoses or external model calls.

## Adventure

Currency is earned from recorded activity, project bonuses and qualified quests. Shop catalog prices and ownership are validated server-side. Purchase, claim and redemption history is append-only to prevent free refunds. Reversing an activity can reduce balance below zero; existing purchased equipment remains but further spending is blocked until balance recovers. User-defined rewards only record redemption; no external product is purchased or reservation made.

Visual movement is CSS animation of generated raster artwork and stops with the pause control or reduced-motion preference. Clothing changes are palette variants. Regions are XP-gated progression choices, not combat levels. The schedule screen remains independent of game visuals.
