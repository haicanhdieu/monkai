---
title: 'Book-data OneDrive migration — Phase 2: reader URL resolver + redeploy'
type: 'feature'
created: '2026-05-28'
status: 'in-review'
context:
  - 'apps/reader/src/shared/services/data.service.ts'
---

**Prerequisite:** Phase 1 (`spec-book-data-onedrive-migration-p1.md`) must be complete and verified before starting this phase.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The reader app's URL resolver assumes a standard HTTP server; setting `VITE_BOOK_DATA_URL` to a `1drv.ms` share link produces malformed fetch URLs because OneDrive requires Graph API path syntax (`/v1.0/shares/{encoded}/root:/{path}:/content`) rather than simple URL concatenation.

**Approach:** Add OneDrive-aware resolution to `data.service.ts` so `VITE_BOOK_DATA_URL` can point to any host — `1drv.ms`, Pi, Windows, R2 — without code changes, then redeploy the reader with the OneDrive read URL set.

## Boundaries & Constraints

**Always:**
- `VITE_BOOK_DATA_URL` remains the single config point for the data source
- Detection is URL-pattern-based: `startsWith('https://1drv.ms/')` — no runtime feature detection
- Non-OneDrive URLs retain existing `toAbsolutePath` behavior exactly — zero regression

**Ask First:**
- If the OneDrive Graph API returns CORS errors in production — halt before adding a proxy

**Never:**
- Do not add authentication to the reader (folder must be publicly shared)
- Do not change the `DataService` interface or caching/storage logic
- Do not discover file paths from OneDrive — always construct from known path

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| OneDrive base URL | `VITE_BOOK_DATA_URL=https://1drv.ms/f/c/...` | fetch URL = `https://api.onedrive.com/v1.0/shares/u!<encoded>/root:/book-data/src/index.json:/content` | Existing network/parse error path unchanged |
| Standard HTTP URL | `VITE_BOOK_DATA_URL=https://ntm-pub.ddns.net` | fetch URL = `https://ntm-pub.ddns.net/book-data/src/index.json` (unchanged) | Same |
| Unset env var (dev) | `VITE_BOOK_DATA_URL` not set | falls back to `http://localhost:3001` (unchanged) | Same |
| Absolute cover URL | `cover_image_url: "https://cdn.example.com/x.jpg"` | returned as-is by `resolveCoverUrl` (unchanged) | Same |

</frozen-after-approval>

## Code Map

- `apps/reader/src/shared/services/data.service.ts` -- URL resolution + fetch; add `isOneDriveShareUrl`, `encodeOneDriveShareUrl`, `resolveFileUrl`; replace `toAbsolutePath` in `fetchJson`
- `apps/reader/src/shared/services/data.service.test.ts` -- unit tests; add `resolveFileUrl` cases
- `apps/reader/.env.production` -- set `VITE_BOOK_DATA_URL` to OneDrive read share URL
- `apps/deployer/scripts/.env.example` -- document `VITE_BOOK_DATA_URL` OneDrive option

## Tasks & Acceptance

**Execution:**
- [x] `apps/reader/src/shared/services/data.service.ts` -- add three pure functions after `toAbsolutePath`: `isOneDriveShareUrl(url: string): boolean` (returns `url.startsWith('https://1drv.ms/')`); `encodeOneDriveShareUrl(shareUrl: string): string` (returns `'u!' + btoa(shareUrl).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')`); `resolveFileUrl(baseUrl: string, path: string): string` (OneDrive → Graph API URL, otherwise → `toAbsolutePath`); replace the `toAbsolutePath(this.baseUrl, path)` call inside `fetchJson` with `resolveFileUrl(this.baseUrl, path)`
- [x] `apps/reader/src/shared/services/data.service.test.ts` -- add `describe('resolveFileUrl')` block: (1) OneDrive share URL + path → correct `api.onedrive.com/v1.0/shares/u!.../root:/.../content` URL; (2) HTTPS server URL + path → unchanged concatenation; (3) empty baseUrl + path → path returned unchanged
- [x] `apps/reader/.env.production` -- set `VITE_BOOK_DATA_URL=https://1drv.ms/f/c/6416cbb4ab103737/IgBHPqOAOKZ0S54hZZw65SRPAYqGOfbjaYFLiSPh6vCyzQ0`
- [x] `apps/deployer/scripts/.env.example` -- in the reader deploy section, add OneDrive as a `VITE_BOOK_DATA_URL` example option with the read share URL and a note to use Phase 1 upload script to populate it
- [ ] [OPERATION] Build and deploy reader: run `node apps/deployer/scripts/deploy-reader-static.mjs`; confirm deploy completes without error — BLOCKED: pre-existing Vercel path misconfiguration (`apps/reader/apps/reader` double-path error); build succeeds locally (`pnpm build` passes, no type errors)

**Acceptance Criteria:**
- Given `VITE_BOOK_DATA_URL` is the `1drv.ms` read share URL, when the reader fetches catalog, then the network request URL starts with `https://api.onedrive.com/v1.0/shares/u!` and ends with `:/content`
- Given `VITE_BOOK_DATA_URL` is any non-OneDrive HTTPS URL, when the reader fetches data, then URL construction is identical to pre-change behavior
- Given `VITE_BOOK_DATA_URL` is unset in dev, when the reader runs, then requests go to `localhost:3001` (no regression)
- Given the deployed reader app, when a user opens the library page, then books load from OneDrive within normal latency

## Design Notes

**OneDrive Graph API URL construction:**

```ts
function resolveFileUrl(baseUrl: string, filePath: string): string {
  if (isOneDriveShareUrl(baseUrl)) {
    const encoded = encodeOneDriveShareUrl(baseUrl)
    const normalized = filePath.replace(/^\/+/, '')
    return `https://api.onedrive.com/v1.0/shares/${encoded}/root:/${normalized}:/content`
  }
  return toAbsolutePath(baseUrl, filePath)
}
```

OneDrive responds with `302 → download URL` for JSON files — `fetch` follows redirects automatically.

## Verification

**Commands:**
- `cd apps/reader && pnpm test -- data.service` -- expected: all tests pass including new `resolveFileUrl` cases
- `cd apps/reader && pnpm build` -- expected: build succeeds with no type errors

**Manual checks:**
- After deploy, open browser DevTools → Network; confirm catalog fetch URL matches `api.onedrive.com/v1.0/shares/u!...`
- Library page loads books and cover images without errors

## Spec Change Log
