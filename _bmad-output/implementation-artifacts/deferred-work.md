
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
