# Dayboard 2.0.0

## Interview-driven upgrade

The day dashboard now gives schedule, tasks, projects and deadlines comparable space. It shows the full day list, eight actionable tasks, five projects and five deadlines with show-all controls. The detailed timeline is optional. Desktop uses two columns and mobile stacks the same information.

Task order supports drag, mobile up/down, pinning and restore-to-recommendation. Order pins are distinct from time-block locks. Project summaries include progress, D-day, next leaf action and remaining leaf count. Deadline risk considers cumulative leaf workload and available working hours without double-counting parents. Quick input accepts a title or optional deadline/duration/project/importance. Basic natural-language parsing opens a review editor before saving; complex plans use the ChatGPT connector.

## Verification evidence

Feature-branch run 34028903793 passed 61 automated checks: 16 original workflow/domain tests, 16 v2 domain tests, 15 connection/consent-state tests and 14 dashboard UI tests. Desktop 1440px and 1024px, intermediate 768px, and mobile 390px/320px were exercised. Browser screenshots were inspected and desktop project whitespace was tightened afterward. The next CI run repeats these tests for the final styling. Main-branch CI also verifies the actual Render site reports version 2.0.0, four panels, mobile fit and working timeline controls.

Ten real PostgreSQL checks passed for the additive metadata migration: legacy records, manual-order storage, ChatGPT pin protection, approved recommendation persistence, invalid metadata rejection, explicit user unpin, revision conflict and cleanup. Tests used a disposable workspace, which was removed. No owner state, key or billing plan was rewritten.

UI/provider simulations are explicitly mocked. Real Google OAuth/Calendar writes are not claimed by those tests. Screenshots use built-in sample or isolated mock data, not the user's schedule. Browser validation runs in authorized GitHub Actions using Playwright/Chromium because this session has no Browser plugin and local navigation is administratively blocked.

## Preserved boundaries

Existing week/month/kanban, XP, backup and connection setup remain. Valid private workspace connection is still required. Google web-client registration and account consent remain separate from ChatGPT authorization. This dashboard update does not reconnect Google or create always-on background sync.

Ordering labels distinguish '내 순서', '저장된 GPT 추천' and '기본 추천'. Restoring order does not call a model. Saved recommendations expire after seven days; fresh GPT recommendations use the existing connector proposal/approval path. Risks and simple parsing are deterministic estimates/rules.

No paid subscription, paid model API, hosting upgrade or billing registration was introduced. Provider quotas/availability limits still apply. This is not a provider-wide billing cap.
