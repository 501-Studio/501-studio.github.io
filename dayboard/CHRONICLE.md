# Chronicle 4.0 — 열두 대륙의 서사

## Scope

An additive Adventure expansion. Existing schedule views, Google integration, completion styling, private workspace connections, prior purchases, XP and star balances remain in the same application.

The new content is bundled Korean prose: 12 regional arcs, 96 chapters with three reading steps each, 192 locally different choice outcomes, 12 regional endings and a three-affinity closing interpretation. This is not 192 separate long branching campaigns. No language model runs inside the app.

The 1,000-hour horizon is a progression design: active completed task estimated minutes / 60. It includes valid prior work and is NOT measured focus time, elapsed gameplay, an AI background timer, or a promise of 1,000 hours of distinct play. Story reading itself does not add schedule tasks, estimated hours or XP. Hour and preceding-story requirements are shown before unlock.

## Content

- 12 regions with separate thematic palettes, NPCs and eight-chapter arcs.
- 72 regional goods plus the original 12 goods: 84 total. Six equipment slots: outfit, companion, camp theme, aura, title, relic. Prices and unlock rules match PostgreSQL. Owned originals keep their prices and IDs.
- 60 free conditional titles, separate from the 15 title products in the full shop. Claim/equip is saved. Buying/equipping a shop title clears the conditional overlay so the chosen title is actually visible.
- 36 regional side missions driven by existing task, routine and reflection records. Rewards are codex memories, not invented star payouts.
- 48 codex entries: 12 endings and 36 mission mementos. Locked ending text stays hidden in the rendered interface.
- Three freely selectable narrative roles; 18 permanent talent steps, one point per four story chapters (24 total). They change profile mastery and role-specific camp/reader commentary, not task XP, monetary value, real ability scores or work speed.
- Old six-region exploration and achievements remain available under the legacy journey disclosure. Original daily/weekly quest, wardrobe and personal-reward flows remain.

## Art and readability

The implemented visual system preserves Dayboard's white planner chrome with a navy illustrated Adventure stage, restrained gold accents and native Korean controls. Region scenes and new costumes/companions are themed variations of existing generated artwork, not 12 separately painted landscapes or 72 distinct character drawings. The two generated large concept boards were design exploration, not deployed screenshot UI.

Readability/QA comparison: (1) keep existing sidebar/nav instead of adding speculative ranking or cash currencies; (2) move long content into labeled tabs; (3) keep reading prose 15–17px with generous line height; (4) use the existing illustrated character rather than rasterizing buttons; (5) on mobile stack stage, story and tabs with contained horizontal tab scrolling; (6) preserve motion-off and reduced-motion behaviors. These are explicit deviations from the speculative full-scene concept, to preserve the user's established clean scheduler and avoid fake features.

## Persistence and safety

New progress is `state.settings.chronicle`: version, chapter choice records, mission records, title unlocks, talent IDs, role, camp and equipped conditional title. Records are not credentials. Do not upload private workspace snapshots or browser keys to this repository.

The new PostgreSQL validator runs after activity derivation. It verifies chapter ordering, estimated-hour gates, immutable existing choices, mission evidence, title ownership, talent prerequisites/points, camp unlocks and expanded shop gates. Existing star-balance, purchase-history, row privacy, approval, revision and parent validation remain enforced. Existing workspace rows are not bulk-migrated; defaults are read lazily and a user's first action creates only their Chronicle metadata.

Task completion undo can lower current unlock progress, but already saved story/mission/title/purchase history is retained. This does not mint replacement currency. Incompatible or stale writes fail explicitly, not as a fabricated success.

## Verification

`tests/chronicle-domain.mjs` covers the full 1,000-hour synthetic path and deterministic rules. `tests/chronicle-browser.cjs` covers actual DOM reading/choices, shop preview/purchase, title equip, missions, role changes, second-browser persistence through mocked RPC, endgame and responsive layouts. Older parent/completion/adventure suites are retained and updated only where navigation genuinely changed.

Twenty-one PostgreSQL checks passed on disposable synthetic workspaces on 2026-09-08. They included exact minute totals, 96 chapter progression, title and relic persistence, duplicate/overspend protection, direct-write protection, talent/mission/camp gates and task undo with earned history retained. Synthetic workspaces and audit records were deleted. Real owner schedules and credentials were not edited. Browser/provider mocks do not certify real Google OAuth or Calendar writes. See the current CI run for final deployment status; this document alone is not proof of a live deploy.

No paid model API, subscription, billing registration, hosting upgrade, cash shop, loot boxes, or inactivity penalties were added. Provider free-tier quotas still apply.
