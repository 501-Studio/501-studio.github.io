# Dashboard v2

The second user interview selects four equal-weight areas: all-day schedule list, eight actionable tasks, five projects and five deadlines. Show-all controls expose larger lists. Existing week/month/kanban/settings and onboarding remain available. Detailed timeline is opt-in; mobile uses stacked panels and tap controls instead of requiring drag gestures.

## Ordering contract for ChatGPT

Read this alongside CHATGPT.md. Use the actual connected workspace ID from the app, not a historical default. Always read the latest revision before proposing updates.

Optional item fields:
- pinned: boolean, default false. Protects ordering, NOT calendar time.
- pinIndex: zero-based preferred slot, integer 0..3999 or null.
- recommendationRank: GPT's zero-based integer 0..3999 or null.
- recommendationAt: ISO timestamp when GPT made the recommendation, or null.

settings.taskOrder is an ordered array of unique task UUIDs, representing the user's manual preference. Never clear it silently. To restore recommendations, propose taskOrder: [] with the user's approval, without changing pinned/pinIndex.

Unpinned tasks follow manual order first. With no manual order, fresh saved GPT ranks are used; unsupplied/expired ranks use local deadline/importance/urgency rules. Ranks expire after seven days. The UI labels these as '내 순서', '저장된 GPT 추천', or '기본 추천'. Restoring does not call a model; requesting a new GPT order opens the existing connector prompt.

Existing pinned metadata cannot be changed by a ChatGPT-origin proposal. Explicit app pin/unpin remains supported. Pins are relative to the currently displayed active list; filtering/completing tasks can compress available slots. A pin does not protect deletion or time placement. Google/fixed time blocks use locked, a separate guard.

## Deadline estimation

Remaining work is estimatedMinutes * (100-progress)/100 on leaf tasks only. Parent deadlines/importance propagate for planning, without rewriting the stored leaf fields. Work competing for the same deadline shares working-time capacity; lunch, buffers and busy external events are excluded. Already booked work for the relevant tasks is not subtracted twice. Danger: overdue or demand exceeds capacity; caution: demand reaches 70 percent. These are estimates, not medical/financial predictions or real-time AI judgments. Missing task decomposition is labelled unknown. Current costs are unaffected.

## Quick input

Title-only entry uses defaults; expandable options cover deadline, estimate, project and importance. Refresh preserves the typed draft. Natural input is a basic single-task rule parser, not a model API: supported dates, duration and exact project names are previewed in the full editor before saving. Unsupported/ambiguous time expressions are warned rather than silently scheduled. Complex decomposition and scheduling use the explicit ChatGPT bridge and approval workflow.

## Data and verification

The backend migration validates additive metadata and protects existing pins. No owner state, credential, permission grant or billing plan is reset. Test fixtures are isolated; CI screenshots are sample/mock data, not the owner's schedule. Real DB validation of the new metadata/proposal path passed ten checks on a disposable workspace, subsequently removed. CI publishes executed domain, workflow, onboarding and browser results. Google account authorization and real Calendar writes are outside the dashboard regression scope.
