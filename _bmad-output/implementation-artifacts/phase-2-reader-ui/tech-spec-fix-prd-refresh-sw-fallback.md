---
title: 'Fix Production Hard-Refresh: SW Navigation Fallback + Vercel SPA Routing'
slug: 'fix-prd-refresh-sw-fallback'
created: '2026-03-14'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['vite-plugin-pwa', 'workbox', 'vercel', 'react-router-dom 6.x']
files_to_modify:
  - 'apps/reader/vite.config.ts'
  - 'apps/reader/vercel.json (new)'
  - 'apps/reader/.env'
  - 'apps/reader/.env.production'
code_patterns:
  - 'Workbox config inline in VitePWA({ workbox: {} }) block in vite.config.ts'
  - 'env.VITE_BASE_PATH available in vite.config.ts via loadEnv — use it to construct dynamic navigateFallback'
  - 'navigateFallbackDenylist is an array of RegExp — fires only on navigate-mode requests'
  - 'workbox.skipWaiting and workbox.clientsClaim force immediate SW activation'
test_patterns:
  - 'e2e tests in apps/reader/e2e/ using Playwright'
  - 'SW e2e tests gated behind TEST_PROD_BUILD=1 env var'
  - 'offline.spec.ts OfflineBanner string is separate from LibraryPage catalog-error string'
---

# Tech-Spec: Fix Production Hard-Refresh: SW Navigation Fallback + Vercel SPA Routing

**Created:** 2026-03-14

## Overview

### Problem Statement

Hard-refreshing any deep route (e.g., `https://monkai-three.vercel.app/library`) on production shows a static offline page ("Bạn đang ngoại tuyến. Vui lòng kiểm tra kết nối mạng của bạn.") instead of the app, and no books load. Works fine on localhost.

**Root causes confirmed by code inspection:**

1. `vite.config.ts:76` — `navigateFallback: 'offline.html'` — when the installed SW intercepts a navigation to `/library`, it checks the precache (no match), falls through to network (Vercel returns 404 for unknown routes), then falls back to `offline.html`. This static page (`public/offline.html:46`) contains exactly the message the user sees — regardless of actual online status.
2. No `vercel.json` — Vercel does not serve `index.html` for unmatched routes by default. Without it, network requests for `/library` return HTTP 404, which triggers the SW's `navigateFallback`.
3. `VITE_BOOK_DATA_URL` in both `.env` and `.env.production` includes a `/book-data` suffix. `data.service.ts` already appends `/book-data/` when fetching, causing a doubled path (`/book-data/book-data/index.json`).

### Solution

Four targeted changes:
1. Make `navigateFallback` dynamic (keyed on `env.VITE_BASE_PATH`) and add `skipWaiting`/`clientsClaim` so the updated SW activates immediately for all users.
2. Add `apps/reader/vercel.json` with a catch-all SPA rewrite — so Vercel serves `index.html` for direct/refresh navigations before the SW is installed.
3. Fix `VITE_BOOK_DATA_URL` in `.env` and `.env.production` to remove the erroneous `/book-data` suffix.

### Scope

**In Scope:**
- Make `navigateFallback` dynamic using `env.VITE_BASE_PATH` in `vite.config.ts`
- Add `skipWaiting: true` and `clientsClaim: true` to workbox config
- Add `navigateFallbackDenylist` (cosmetic, documents intent)
- Create `apps/reader/vercel.json` with SPA rewrite rules
- Fix `VITE_BOOK_DATA_URL` in `.env` and `.env.production`

**Out of Scope:**
- Changes to React app logic, `useOnlineStatus`, or `LibraryPage`
- Changes to `data.service.ts` (paths are correct; only the env var is wrong)
- CORS or R2 bucket configuration
- PWA manifest, icons, or theme changes
- `offline.html` content (stays as-is; no longer used as SW nav fallback)
- New automated e2e tests (manual verification sufficient)

## Context for Development

### Codebase Patterns

- Workbox config lives entirely inside the `workbox: { ... }` block of `VitePWA({})` in `apps/reader/vite.config.ts` (lines 74–107). No separate workbox config file.
- `env` is already loaded at the top of `vite.config.ts` via `const env = loadEnv(mode, process.cwd(), '')`. Use `env.VITE_BASE_PATH` to compute the correct `navigateFallback` path.
- **Base path clarification:** `.env.production` has `VITE_BASE_PATH=/monkai/`, but the deploy script (`deploy-reader-static.mjs:28`) does `const basePath = process.env.VITE_BASE_PATH ?? '/'` and passes `--build-env VITE_BASE_PATH=${basePath}`. Since `VITE_BASE_PATH` is unset in the typical deploy invocation, the build receives `VITE_BASE_PATH=/` via `--build-env`, which overrides `.env.production` (process env vars take precedence over `.env.production` in Vite's `loadEnv`). The current production deployment at `https://monkai-three.vercel.app/library` (root-relative URLs) confirms base path is `/`. **However**, the implementation must be robust to any base path, not hard-coded to `/`.
- `navigateFallback` must be the absolute URL of `index.html` within the app scope. Compute it as: strip trailing slashes from `VITE_BASE_PATH`, append `/index.html`.
- `navigateFallbackDenylist` only fires on `request.mode === 'navigate'` requests (top-level page navigations). XHR/fetch requests to `/book-data/` are never navigation requests and never matched by `navigateFallback`. The denylist is cosmetic — documents intent, provides no functional protection.
- `workbox.skipWaiting: true` and `workbox.clientsClaim: true` force the new SW to activate immediately on all open tabs without waiting for the user to close tabs or accept a prompt. This is necessary to ensure existing users with the broken old SW get the fix without manual intervention.
- `vercel.json` goes at `apps/reader/vercel.json` — deploy script runs `vercel deploy` with `cwd: apps/reader`. No `vercel.json` exists anywhere in the repo today.
- **`vercel.json` base-path coupling:** The rewrite destination `/index.html` is correct for the current base-path-`/` deployment. If `VITE_BASE_PATH` is changed to a subdirectory (e.g., `/monkai/`), the destination must be updated to match (e.g., `/monkai/index.html`) and the source pattern updated accordingly. Document this in a comment or note.
- **Runtime cache regexes and absolute R2 URLs:** The existing `runtimeCaching` patterns (e.g., `/\/book-data\/.*/`) perform substring matching against the full request URL string. They correctly match absolute R2 URLs such as `https://pub-xxx.r2.dev/book-data/index.json` because the substring `/book-data/` appears in the URL. No changes to `runtimeCaching` are required.
- **`_headers` / CSP landmine:** The `_headers` file in `public/` uses Netlify format and is NOT applied by Vercel as HTTP headers. However, if HTTP headers are ever added to `vercel.json` in the future, do NOT copy the `connect-src 'self'` CSP from `_headers` — it would block cross-origin R2 fetches.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/vite.config.ts:17,74-107` | `env` loaded at line 17; workbox config lines 74–107 — all changes go here |
| `apps/reader/public/offline.html:46` | Source of the exact message the user sees |
| `apps/deployer/scripts/deploy-reader-static.mjs:28` | `basePath` defaults to `/` — explains why `VITE_BASE_PATH=/monkai/` in `.env.production` is overridden |
| `apps/reader/src/shared/services/data.service.ts:87-107` | Confirms fetch paths use `/book-data/` prefix — env var must NOT include it |
| `apps/deployer/scripts/.env.example:18` | Documents correct `VITE_BOOK_DATA_URL` as bare bucket root (no `/book-data` suffix) |
| `apps/reader/src/shared/constants/offline.copy.ts` | `catalogOfflineTitle` = "Bạn đang ngoại tuyến" — the ErrorPage title shown when catalog fetch fails offline |
| `apps/reader/src/shared/components/OfflineBanner.tsx` | Shows "Đang offline — đọc từ bộ nhớ đệm" — a *separate* UI element from the catalog error page |

### Technical Decisions

- **Dynamic `navigateFallback`** — computed from `env.VITE_BASE_PATH` rather than hard-coded `'/index.html'`. Correct for any base path, future-proof.
- **`skipWaiting: true` + `clientsClaim: true`** — with `registerType: 'prompt'`, users who dismiss the update banner keep the old broken SW indefinitely. These two workbox flags ensure the updated SW activates immediately on all tabs after deploy, bypassing the prompt mechanism. Trade-off: potential content flash on tab(s) open at update time; acceptable for a bug fix.
- **Genuine offline UX is preserved** — when truly offline after this fix: SW serves precached `index.html`, React app loads, `useCatalogIndex` fails with `DataError('network')`, `useOnlineStatus` returns `false`, `LibraryPage` shows `OFFLINE_COPY.catalogOfflineTitle` ("Bạn đang ngoại tuyến") in an `ErrorPage` component. This is distinct from `OfflineBanner` which shows "Đang offline — đọc từ bộ nhớ đệm" — both can appear simultaneously.
- **`VITE_BOOK_DATA_URL` root cause** — `data.service.ts` constructs URLs as `baseUrl + '/book-data/index.json'`. Current value `https://pub-xxx.r2.dev/book-data` causes `/book-data/book-data/index.json`. Fix: set to bare bucket root `https://pub-f372aac7cb1749f3927f74f6375153b5.r2.dev`. The runtime cache regexes still match correctly (substring match on full URL).

## Implementation Plan

### Tasks

- [x] Task 1: Update workbox config in `vite.config.ts`
  - File: `apps/reader/vite.config.ts`
  - Action: In the `workbox:` block (~line 76), make these three changes:
    1. Replace `navigateFallback: 'offline.html'` with a dynamic value:
       ```ts
       const baseFallback = (env.VITE_BASE_PATH ?? '/').replace(/\/+$/, '')
       // then inside workbox block:
       navigateFallback: `${baseFallback}/index.html`,
       ```
       Note: compute `baseFallback` before the `return { ... }` block (alongside the existing `env` usage), then reference it inside `workbox: { ... }`.
    2. Add `navigateFallbackDenylist: [/^\/book-data\//],` on the line after `navigateFallback`.
    3. Add `skipWaiting: true,` and `clientsClaim: true,` anywhere inside the `workbox:` block (e.g., after `globPatterns`).
  - Notes: `env` is already in scope (line 17 of `vite.config.ts`). The resulting diff touches ~5 lines inside the `workbox:` block. No other changes.

- [x] Task 2: Create `apps/reader/vercel.json`
  - File: `apps/reader/vercel.json` (new file)
  - Action: Create with the following content:
    ```json
    {
      "rewrites": [
        { "source": "/((?!book-data/).*)", "destination": "/index.html" }
      ]
    }
    ```
  - Notes: This is correct for `VITE_BASE_PATH=/` (current deployment). If `VITE_BASE_PATH` is ever changed to a subdirectory, both `source` and `destination` must be updated. The rewrite catches all routes except `/book-data/*`.

- [x] Task 3: Fix `VITE_BOOK_DATA_URL` in env files
  - Files: `apps/reader/.env` and `apps/reader/.env.production`
  - Action: In both files, change:
    ```
    VITE_BOOK_DATA_URL=https://pub-f372aac7cb1749f3927f74f6375153b5.r2.dev/book-data
    ```
    to:
    ```
    VITE_BOOK_DATA_URL=https://pub-f372aac7cb1749f3927f74f6375153b5.r2.dev
    ```
  - Notes: `data.service.ts:fetchJson` already prepends `/book-data/` to all paths. The current `/book-data` suffix creates a doubled path. The `.env.example` already documents the correct format (bare bucket root). No changes to `.env.example` needed.

### Acceptance Criteria

- [ ] AC-1: Given a user has previously visited the app (SW installed and active), when they hard-refresh `https://monkai-three.vercel.app/library`, then the Library page renders with books — not `offline.html`.

- [ ] AC-2: Given no service worker is installed (first visit / Incognito / cleared cache), when a user navigates directly to `https://monkai-three.vercel.app/library`, then the Library page renders correctly. (Vercel rewrite serves `index.html`; React Router handles the route.)

- [ ] AC-3: Given the user is genuinely offline (network disconnected) and the SW is installed, when they navigate to `/library`, then the React app loads and the `LibraryPage` catalog error section displays with title "Bạn đang ngoại tuyến" (`OFFLINE_COPY.catalogOfflineTitle` via `ErrorPage` component) — not the static `offline.html`. The `OfflineBanner` ("Đang offline — đọc từ bộ nhớ đệm") may also be visible simultaneously; this is expected and correct.

- [ ] AC-4: Given any valid app route (`/reader/:id`, `/bookmarks`, `/settings`), when the user hard-refreshes the page, then the correct feature page renders.

- [ ] AC-5: Given the app is online, when the catalog data is fetched, the network request goes to `https://pub-f372aac7cb1749f3927f74f6375153b5.r2.dev/book-data/index.json` (verified in DevTools Network tab — no `/book-data/book-data/` doubling), and books load successfully.

- [ ] AC-6: Given a user with the old SW installed who visits the app after the new SW is deployed, when the page loads, then the new SW activates immediately (no prompt required) — verified by DevTools > Application > Service Workers showing the new SW as active, not "waiting".

## Review Notes

- Adversarial review completed
- Findings: 12 total, 2 fixed (F3 comment + F10 cleanupOutdatedCaches), 7 skipped (noise/out-of-scope), 1 policy decision skipped (F1), 2 undecided skipped (F4 pre-existing, F8 unverified regex)
- Resolution approach: auto-fix

## Additional Context

### Dependencies

- No new npm packages required.
- Requires a new Vercel deployment to take effect.
- `skipWaiting: true` + `clientsClaim: true` ensure existing users get the fix on their next page load without manual action. Users may experience a brief page reload when the new SW takes over an already-open tab — acceptable for a bug fix deploy.

### Testing Strategy

Manual verification steps against actual Vercel deployment:

1. **First-visit test (AC-2, no SW):** Open Incognito → navigate directly to `https://monkai-three.vercel.app/library` → confirm Library page loads.
2. **Hard-refresh test (AC-1, with SW):** Visit app normally → wait for SW to install → hard-refresh `/library` → confirm Library renders.
3. **Other routes (AC-4):** Hard-refresh `/bookmarks`, `/settings` → confirm correct pages render.
4. **Genuine offline (AC-3):** DevTools → Network → Offline → navigate to `/library` → confirm React app loads and shows "Bạn đang ngoại tuyến" error section (not the static `offline.html`).
5. **Correct R2 URL (AC-5):** Normal visit → DevTools Network tab → confirm request to `https://pub-f372aac7cb1749f3927f74f6375153b5.r2.dev/book-data/index.json` (not `/book-data/book-data/...`).
6. **SW immediate activation (AC-6):** Deploy → open existing tab → confirm new SW activates without prompt (DevTools > Application > Service Workers).

> **Note:** `pnpm build && pnpm preview` does NOT apply `vercel.json` routing rules. Direct navigation to `http://localhost:4173/library` during preview will 404. AC-2 must be verified against the actual Vercel deployment, not local preview.

### Notes

- **`_headers` / CSP:** The `public/_headers` file uses Netlify format and is NOT applied by Vercel as HTTP headers. It has no effect on the current deployment. **Caution:** if HTTP headers are ever added to `vercel.json`, do NOT include `connect-src 'self'` — it would block cross-origin R2 data fetches.
- **`vercel.json` base-path coupling:** The destination `/index.html` is correct only for `VITE_BASE_PATH=/`. If the deployment base path ever changes to a subdirectory, both the `source` and `destination` in `vercel.json` must be updated to match.
- **`offline.html` stays** — still precached via `includeAssets`. Accessible at `/offline.html` directly but no longer the SW navigation fallback.
- **Runtime cache regexes are unaffected** — patterns like `/\/book-data\/.*/` use substring matching and correctly match full absolute R2 URLs. No changes to `runtimeCaching` needed.
