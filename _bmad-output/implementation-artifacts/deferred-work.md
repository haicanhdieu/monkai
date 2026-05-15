# Deferred Work

Pre-existing issues surfaced during review of `fix-oom-vnthuquan-batch-assembly` (2026-05-08).
None of these were introduced by that change.

---

## `_books_remaining` not decremented for cancelled assemblers on abort

**File:** `apps/crawler/vnthuquan_crawler.py` — `_assemble_book` closure  
**Issue:** When abort fires and assemblers are cancelled before reaching the `try/finally` block (i.e., while still awaiting `coll.completed.wait()`), `self._books_remaining` is never decremented for those books. This can cause `_monitor_health` to spin on a non-zero count until the stall timeout fires.  
**Pre-existing:** Same pattern was in the original single-pass code.

---

## `asyncio.wait(FIRST_COMPLETED)` — simultaneous completion race

**File:** `apps/crawler/vnthuquan_crawler.py` — both the Phase C queue-drain race and the Phase D assembler race  
**Issue:** If `abort_task` (or `abort_watch`) and the work task complete in the same event-loop tick, both appear in `done`. The `abort_task in done` check evaluates `True` even when all work completed successfully, causing the abort branch to fire and skip `state.mark_downloaded`. The batch re-downloads on next run.  
**Fix when addressed:** `aborted = abort_task in done and join_task not in done` (and same for assembler phase).  
**Pre-existing:** Same `asyncio.wait` pattern was in the original code.

---

## `ensure_future` wrapping `asyncio.gather(*tasks)` is redundant

**File:** `apps/crawler/vnthuquan_crawler.py` — Phase D assembler gather  
**Issue:** `asyncio.gather` on `Task` objects already returns a `Future`; wrapping in `ensure_future` adds a no-op indirection and a misleading comment. Cosmetic only.  
**Pre-existing:** Copied comment and pattern from original code.

---

## Path traversal check in `StaticJsonDataService.getBook` is incomplete

**File:** `apps/reader/src/shared/services/data.service.ts` — `getBook`  
**Issue:** `artifactPath.startsWith('/') || artifactPath.includes('..')` does not block URL-encoded traversal (`%2F`, `%2e%2e`) or Windows-style separators. Pre-existing before the offline-mode fix.  
**Fix when addressed:** Validate that the resolved fetch URL starts with the expected `/book-data/` prefix after URL construction, rather than string-matching the raw path.

---

## Concurrent `getBook` calls not deduplicated

**File:** `apps/reader/src/shared/services/data.service.ts` — `getBook`  
**Issue:** Unlike `getCatalog`, `getBook` has no in-flight promise deduplication. Multiple simultaneous calls for the same `(id, source)` each make independent network requests. Pre-existing before the offline-mode fix.  
**Fix when addressed:** Add a `bookPromises: Map<string, Promise<Book>>` similar to `catalogPromises`.

---

## Search input mobile UX gaps (surfaced during fix-search-input-mobile-zoom, 2026-05-11)

Pre-existing issues in `LibrarySearchBar.tsx` and `BookmarkSearchBar.tsx`. None introduced by the zoom fix.

**1. No `autoComplete`/`autoCorrect`/`spellCheck` suppression on search inputs**
iOS auto-corrects Vietnamese scripture titles in search. Add `autoComplete="off" autoCorrect="off" spellCheck={false}` to both inputs.

**2. `LibrarySearchBar` uses `type="text"`, `BookmarkSearchBar` uses `type="search"` (inconsistent)**
`type="search"` gives native clear affordances that duplicate the custom clear button. Decide and align both.

**3. Input text color set inconsistently — `BookmarkSearchBar` uses inline `style={{ color }}`, `LibrarySearchBar` inherits**
If a parent ever sets a different foreground color, the library input text may become invisible. Add explicit `style={{ color: 'var(--color-text)' }}` to `LibrarySearchBar` input.

**4. Placeholder text color not themed in either component**
Placeholder inherits browser default rather than `var(--color-text-muted)`. Add `placeholder:text-[var(--color-text-muted)]` (Tailwind) or CSS `::placeholder { color: ... }`.

**5. `<html lang="en">` mismatch — app serves Vietnamese content**
`apps/reader/index.html` declares `lang="en"`. Change to `lang="vi"` for correct screen reader language detection.

**6. No future safeguard against re-introducing `text-sm` on new inputs**
No lint rule or test asserts `font-size >= 16px` on focusable inputs. Consider an ESLint rule or a Playwright assertion with device emulation if this regresses.

---

## `concurrency=0` silently skips all active collectors

**File:** `apps/crawler/vnthuquan_crawler.py` — `_chunked(active_collectors, 0)`  
**Issue:** `islice(it, 0)` yields nothing; the while loop never runs; all books are silently unprocessed and `_books_remaining` is never decremented.  
**Pre-existing:** Original code had `min(concurrency, total_to_fetch) = 0` workers with the same effect. Pydantic config validator likely prevents `concurrency < 1` in practice.  
**Fix when addressed:** Add `if concurrency <= 0: raise ValueError(...)` in `_chunked` or at call site.

---

## win-server: cloudflared healthcheck gap — cloudflared starts before Caddy is confirmed healthy (surfaced 2026-05-14, updated 2026-05-15)

**File:** `apps/deployer/win-server/docker-compose.yml`  
**Issue:** `depends_on: caddy` only waits for the container to be created, not for Caddy to be listening on `:80`. If Caddyfile is bad or the book-data volume fails, cloudflared starts, finds nothing on `caddy:80`, and crash-loops with noisy logs.  
**Fix when addressed:** Add a `healthcheck` on the `caddy` service (`wget -qO- http://localhost:80/`) and change cloudflared's `depends_on` to `condition: service_healthy`.

---

## win-server: Caddyfile enables directory listing by default (surfaced 2026-05-14)

**File:** `apps/deployer/win-server/Caddyfile`  
**Issue:** `file_server` without `browse` does NOT enable listing by default in Caddy v2 — this finding was inaccurate. No action needed. Defer as rejected.

---

## Cross-origin cover images may not be cached by Workbox (surfaced during cover-offline-cache, 2026-05-15)

**Files:** `apps/reader/vite.config.ts` (all `runtimeCaching` rules), `apps/reader/src/features/home/DiscoverStrip.tsx`, `apps/reader/src/features/bookmarks/BookmarksPage.tsx`  
**Issue:** When the app and book-data server are on different origins (e.g., app on GitHub Pages, data on ngrok), `<img>` tags without `crossorigin="anonymous"` send `no-cors` fetches, producing opaque responses (HTTP status 0). Workbox does not cache opaque responses by default, so ALL image caching rules (including the new `cover-image-cache`) silently fail for cross-origin covers.  
**Pre-existing:** The existing `book-data-cache` NetworkFirst rule has the same problem. The new `cover-image-cache` rule neither causes nor worsens it.  
**Fix when addressed:** (1) Add `crossorigin="anonymous"` to `<img>` tags rendering cover images in `DiscoverStrip.tsx`, `HomePage.tsx`, and `BookmarksPage.tsx`. (2) Add `cacheableResponse: { statuses: [0, 200] }` (or just `{ statuses: [200] }` if crossorigin is added) to the `cover-image-cache` and `book-data-cache` Workbox rules to explicitly allow caching of these responses.

---

## Workbox runtimeCaching rules don't account for VITE_BASE_PATH prefix (surfaced during cover-offline-cache, 2026-05-15)

**File:** `apps/reader/vite.config.ts` — all `runtimeCaching` URL patterns  
**Issue:** If `VITE_BASE_PATH=/reader`, URLs become `/reader/book-data/...`. Patterns like `/\/book-data\/.*/` don't match. All rules fail silently — requests fall through to the SW's default fetch handler (network only, no cache).  
**Pre-existing:** Affects all existing rules, not introduced by the cover cache rule.  
**Fix when addressed:** Compute patterns dynamically using `baseFallback`: e.g., `new RegExp(baseFallback + '/book-data/index\\.json')`. Then all patterns correctly include any configured base path.

---

## win-server: cloudflared image tag unpinned (surfaced 2026-05-15)

**File:** `apps/deployer/win-server/docker-compose.yml`  
**Issue:** `image: cloudflare/cloudflared:latest` is a floating tag. An unattended `docker compose pull` can silently upgrade cloudflared to a breaking version.  
**Fix when addressed:** Pin to a specific stable version, e.g. `cloudflare/cloudflared:2025.1.0`, and update periodically after verifying the new version works.

---

## win-server: Cloudflare quick-tunnel ToS constraints on persistent use (surfaced 2026-05-15)

**Issue:** Cloudflare's Terms of Service for quick-tunnels discourage using them as persistent production infrastructure and include undocumented availability constraints. If the tunnel is relied upon for always-on book-data access, these constraints may apply.  
**Fix when addressed:** If URL-change friction or availability becomes unacceptable, migrate to Cloudflare Named Tunnel (free Cloudflare account + domain on Cloudflare DNS) for a stable URL — that requires a separate spec.

---

## win-server: BOOK_DATA_PATH in .env uses Mac path — will mount empty dir on Windows (surfaced 2026-05-14)

**File:** `apps/deployer/win-server/.env` (not committed to git — `.gitignore` excludes it)  
**Issue:** `.env` was likely set up on the Mac dev machine and not updated with the Windows host path. Docker will silently mount an empty directory, causing Caddy to return 404 for all book-data requests with no error in logs.  
**Fix when addressed:** Update `.env` on the Windows server: set `BOOK_DATA_PATH` to the actual Windows path to the `book-data` directory (e.g., `C:\Users\YourUser\monkai\apps\crawler\data\book-data`).
