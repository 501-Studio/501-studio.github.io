# SimsimLAB

> Tests you absolutely didn’t need to take. But now you need to know.

Static, multilingual viral quiz site: 50 quizzes, 14 locales, 5 two-player flows, no account, no application server, no database, and no AI API at runtime.

## Stack

- Astro static generation
- Data-driven shared quiz engine
- Vanilla client JavaScript for quiz state, Web Share, Canvas result images, localStorage
- GitHub Pages deployment with GitHub Actions

## Local run

```bash
npm install
npm run verify
npm run dev
```

Build:

```bash
npm run build
```

## Architecture

- `src/data/catalog.mjs`: 50 test definitions and flagship/category metadata
- `src/data/locales/*.mjs`: 14 physically separated locale content packs; `src/data/locales.mjs` is only the registry
- `src/data/content.mjs`: locale + definition composition; no duplicated quiz engine
- `public/quiz-engine.js`: deterministic scoring, two-player fragment payloads, result share/save
- `src/components/`: reusable header, footer, cards, and dormant ad slot
- `src/pages/[locale]/tests/[slug]/`: one reusable Astro route generating all locale/test pages

## Add test #51

1. Add one object to `src/data/catalog.mjs`.
2. Add its localized title in each locale title list in `src/data/locales.mjs`.
3. If it should be flagship, mark `flagship: true` and optionally add custom result names in `content.mjs`.
4. Run `npm run verify` and `npm run build`.

Home cards, static test routes, SEO tags, hreflang, sitemap inclusion, recommendations, and quiz UI are generated automatically.

## Add a locale

Add one `src/data/locales/<code>.mjs` pack with native UI copy, 50 titles, 8 localized scenario templates, result archetypes, categories, and metrics, then register that one file in `src/data/locales.mjs`. Static routes and hreflang are derived from the locale registry. Set `dir: 'rtl'` for RTL languages.

## Analytics

`public/analytics.js` exposes the requested event abstraction and dispatches `simsim:analytics`. It does not send data anywhere in v1. If a future analytics provider is connected, subscribe to that event or provide `window.dataLayer`. Do not add PII.

Events: `homepage_view`, `quiz_card_click`, `quiz_start`, `question_answer`, `quiz_complete`, `result_view`, `result_share`, `result_image_save`, `copy_link`, `two_player_invite`, `two_player_complete`, `next_quiz_click`, `random_quiz_click`, `locale_change`.

## Ads

`src/components/AdSlot.astro` is intentionally dormant. To add AdSense later, implement the provider code there and activate only the placements you want. Do not change quiz logic.

## GitHub Pages

`astro.config.mjs` defaults to:

- `site`: `https://501-studio.github.io`
- `base`: `/simsim-lab`

`.github/workflows/deploy.yml` builds and deploys `dist` whenever `main` changes.

In GitHub: **Settings → Pages → Build and deployment → Source → GitHub Actions**.

Expected URL: `https://501-studio.github.io/simsim-lab/`

## Custom domain later

Set `PUBLIC_SITE=https://your-domain.example` and `PUBLIC_BASE_PATH=/` in the build environment, then add the DNS/CNAME configuration appropriate for GitHub Pages.

## Privacy

Solo answers are browser-only. Two-player answers are packed into the URL fragment (`#...`), which is not part of normal HTTP requests. Favorites and recents use localStorage.