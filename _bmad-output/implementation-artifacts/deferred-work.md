
## library-search-state-restore deferred findings (2026-06-08)

- **`useState(initialQuery)` divergence from store**: `useLibrarySearch` initialises `query`/`debouncedQuery` from `initialQuery` only at mount. If `libraryNavStore.savedQuery` changes while LibraryPage is mounted (possible in future multi-tab or background sync scenarios), the hook's `query` state won't reflect it. Currently harmless — only one caller and store only changes via user interaction.
- **Single `rAF` for scroll restore**: `requestAnimationFrame` fires before `ResizeObserver` measurements complete on large result sets with slow devices. Virtual items shift slightly after measurement, but the scroll position is approximately correct. If restore accuracy becomes a complaint on low-end devices, consider `double-rAF` or wiring directly into `virtualizer.scrollToOffset()` (requires lifting the virtualizer instance to `LibraryPage`).
- **Scroll save uses `pointerdown` capture (not unmount)**: React Router v7 with `BrowserRouter` uses `startTransition` for navigation — LibraryPage stays mounted during the transition (component is never unmounted/remounted on navigating to a book and pressing Back). As a result, `useLayoutEffect`/`useEffect` cleanup never fires for this flow. Implemented instead: capture `main.scrollTop` on `pointerdown` on `<a[href]>` elements in the capture phase (fires before React Router's click handler). Scroll restoration uses a `popstate` listener (`window.addEventListener('popstate', ...)`) to detect Back/Forward navigation and reset the once-per-nav guard, because `useLocation().key` never changes inside the kept-alive component.
- **`location.key` is always `'default'` in LibraryPage**: Because React Router v7 keeps LibraryPage mounted and never re-renders it on route changes (via startTransition), `useLocation()` returns the initial location (key='default') throughout the component's lifecycle. Any future code in LibraryPage that depends on `location.key` changing per-navigation will not work — use `popstate` or a URL-based check via the `document` instead.

## pi-server-migration deferred findings (2026-06-01)

- **journalctl `--since` + `-f` on older systemd (<246)**: `--since` may be silently ignored in follow mode; watcher misses the current URL until cloudflared next reconnects. Raspberry Pi OS Bookworm ships systemd 252 — not an issue there, but worth noting for older OS images.
- **`yaml_field` fragility**: `grep + sed` parser truncates YAML values containing `:` (e.g. `password: abc:def`). Acceptable for these YAML files (simple credentials, no embedded colons expected). Fix properly if values ever change shape.
- **`/book-data` bare path → 403**: Caddyfile matches `/book-data` exactly; Caddy returns 403 for a directory without `browse`. Not a functional issue (clients use sub-paths). Add explicit redirect `/book-data → /book-data/` if a directory listing is ever needed.
- **Journal replay window expires after >5 min url-watcher downtime**: if url-watcher is down longer than 5 min, the cloudflared URL line won't be replayed on restart. GitHub variable retains the old URL until cloudflared next reconnects. Low probability in normal operation (Restart=always, RestartSec=10).

## library-render-bottleneck deferred findings (2026-05-24)

- **`b.categorySlug` case/whitespace mismatch in `getCategoryBySlug`**: filter uses `b.categorySlug === category.slug` (raw equality). If catalog data has inconsistent casing, books are silently excluded. Pre-existing behavior — normalize both sides if data quality becomes an issue.
- **Empty categories state**: `buildLibraryCategoryHeaders` returns `[]` when catalog has no categories; UI shows "0 nhóm" with an empty grid and no explanation. Pre-existing — add empty state if needed.
- **`LibrarySearchHub` eager MiniSearch**: `LibrarySearchHub.tsx` (dead code, not used in production) still passes full book list to `useLibrarySearch` without lazy guard. Update if component is ever reactivated.

## catalog-preload deferred findings (2026-05-24)

- **Stale-closure race on rapid source switches**: `useCatalogPreload` IIFE captures `activeSource` at invocation; no cancellation if source changes mid-await. Writes go to different keys so no collision, but the old source's `invalidateQueries` fires unnecessarily. Fix: add `let cancelled = false` + cleanup returning `() => { cancelled = true }`.
- **Zustand persist hydration timing**: `useActiveSource` may return `DEFAULT_SOURCE` on first effect fire if Zustand hasn't rehydrated yet. Preload seeds the default source's cache; effect re-runs when `activeSource` updates to persisted value. Wasted storage read, not a visible bug.
- **StrictMode double-invalidation**: In dev, effects fire twice → two `invalidateQueries` calls queued. Production unaffected; dev is noisier than necessary.
- **Minimal shape validation in preload**: Only `Array.isArray(cached.books)` checked. Storage key is versioned (`catalog_cache_v1_`) but individual book fields aren't validated. A schema version bump that adds required fields could serve stale objects with missing fields from cache.

## offline-book-cache deferred findings (2026-05-24)

- **Retry doubles reads on cold-cache miss**: With global `retry: 1`, when offline and no localforage cache, `queryFn` runs twice (2 network failures + 2 localforage misses). Add `retry: false` to `useBook` / `useCatalogIndex` when this causes noticeable delay (only relevant when book was never cached).
- **`networkMode: 'always'` not in QueryClient defaults**: Any future query that uses a localforage fallback pattern must remember to add `networkMode: 'always'`. Consider setting it globally in `main.tsx` instead.
- **No `enabled` guard on `useCatalogIndex`**: Fires unconditionally for any `source` value. Pre-existing; unrelated to offline fix.
- **Integration test gap**: No test verifies that `useBook` / `useCatalogIndex` call queryFn when `navigator.onLine === false`. Existing `data.service.test.ts` covers the localforage fallback; TQ networkMode is a library feature, but a regression test at the hook level would be valuable.

## url-watcher-github-var deferred findings (2026-05-20)

- **Docker socket over-privilege**: `/var/run/docker.sock` mount gives container root-equivalent host access. Pre-existing risk. Consider rootless Docker or API-based container inspection.
- **`vars.CLOUDFLARE_TUNNEL_URL` unset on first deploy**: CI produces `"dest": "/book-data/$1"` (broken route) if GitHub variable not initialized before first push. Fix: add CI step to fail fast when variable is empty.
- **Classic PAT scope**: `.env.example` documents `repo` scope (over-privileged). Consider updating example to only reference fine-grained PAT with Actions + Variables read/write only.
- **Concurrent cloudflared start events during crash-loop**: Multiple events queue serially; two dispatches may fire with near-identical URLs. Consider debounce lock file in watch.sh.

## onedrive-migration-p1 deferred findings (2026-05-28)

Source: `apps/deployer/scripts/upload-book-data-to-onedrive.mjs`

- **Bandwidth throttle**: No `--bwlimit`, `--transfers`, or `--checkers` flags. On a server also serving readers, a large sync may saturate upload bandwidth. Add `--bwlimit` if needed.
- **No audit log**: `--log-file` and `--log-level INFO` not passed to rclone. No persistent record of what was transferred or deleted. Consider adding if audit trail is needed.
- **No rclone remote preflight check**: Script does not run `rclone listremotes` before syncing. A misconfigured remote produces a cryptic rclone error. Consider adding a preflight validation step.
- **Unknown args silently ignored**: `--dryrun` (typo) or other unrecognized flags proceed as a live sync without warning. Add arg validation if operators frequently mistype flags.
