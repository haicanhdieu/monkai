---
title: 'Fix: epub.js fails to load JSON-converted EPUB (parse error on reader open)'
slug: 'fix-epub-load-from-json-book'
created: '2026-03-12'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack:
  - React 18 / Vite 7
  - epubjs 0.3.x
  - jszip 3.x
  - localforage 1.x / StorageService
  - TypeScript strict (verbatimModuleSyntax)
  - Vitest 4.x + jsdom + @testing-library/react
files_to_modify:
  - apps/reader/src/shared/lib/bookToEpub.ts
  - apps/reader/src/features/reader/useEpubFromBook.ts
  - apps/reader/src/features/reader/ReaderPage.tsx
  - apps/reader/src/features/reader/useEpubReader.ts
  - apps/reader/src/shared/constants/storage.keys.ts
  - apps/reader/src/features/reader/ReaderPage.test.tsx
files_to_create:
  - apps/reader/src/shared/lib/bookToEpub.test.ts
  - apps/reader/src/features/reader/useEpubFromBook.test.ts
# Note: We migrated to epub.js — reader stack and related docs need updating where they still reference the previous reader engine.
code_patterns:
  - StorageService (never import localforage directly)
  - useEffect with cancel-flag + revokeObjectURL cleanup pattern
  - Derived state (compute from existing state rather than new useState)
test_patterns:
  - vi.mock for StorageService and bookToEpubBuffer
  - vi.stubGlobal for URL.createObjectURL / revokeObjectURL
  - renderHook from @testing-library/react for custom hooks
  - JSZip used inside tests to inspect generated EPUB zip structure
---

# Tech-Spec: Fix: epub.js fails to load JSON-converted EPUB (parse error on reader open)

**Created:** 2026-03-12

## Overview

### Problem Statement

Opening a book without a pre-built `epubUrl` in the catalog (e.g. `5cb15d2a-94d8-4c10-840d-cd934ac19627` — Bộ Trung Quán, 168 chapters) shows "Nội dung kinh bị lỗi định dạng." instead of the epub.js reader. This affects all books in dev mode because `build:epubs` is not run on `pnpm dev`.

Two bugs work together to produce the permanent error:

**Bug A — Race condition (`useEpubFromBook.ts`):**
`useState(!!book)` initialises `isLoading` as `false` because the component always mounts with `book = undefined` (while `useBook` is still fetching). When `useBook` resolves, the FIRST re-render with a real `book` value arrives at `useEpubFromBook` with stale state: `{ isLoading: false, epubUrl: null, error: null }` — the effect hasn't fired yet. `ReaderPage` then hits `if (!epubUrl) → <ReaderErrorPage category="parse" />`. If EPUB building subsequently also fails (Bug B), this never self-corrects.

**Bug B — Invalid XHTML from control characters (`bookToEpub.ts`):**
`book.content` is paragraph text that has been decoded by `decodeHtmlEntities` in `book.schema.ts` (DOM-based: `textarea.innerHTML = html`). This decodes numeric HTML entities like `&#8;` → `\x08` (backspace). `xmlEscape` only handles `&`, `<`, `>`, `"` and does NOT strip XML 1.0 forbidden control characters (U+0001–U+0008, U+000B, U+000C, U+000E–U+001F, U+FFFE, U+FFFF). These characters pass into `content.xhtml` unmodified, making it invalid XML. epub.js's DOMParser rejects the XHTML and fires `openFailed`, which `useEpubReader` catches, sets `error`, and `ReaderEngine` renders `<ReaderErrorPage category="parse" />` permanently.

`build-epubs.mjs` (the build-time script) uses a simpler string-based entity decoder that does NOT decode arbitrary `&#n;` entities, so it is less exposed to this issue.

### Solution

Fix both bugs independently:

1. **Bug A fix** — Derive the returned `isLoading` value in `useEpubFromBook`: return `isLoading || (book !== null && epubUrl === null && error === null)`. This ensures the hook never returns `{ isLoading: false, epubUrl: null, error: null }` when `book` is non-null (i.e. when content is expected but not yet ready).

2. **Bug B fix** — Add a `sanitizeXml(text)` helper in `bookToEpub.ts` that strips forbidden XML 1.0 control characters, and apply it to each paragraph before `xmlEscape`. No structural changes to the EPUB — the single-file `content.xhtml` layout matches `build-epubs.mjs` and is correct.

### Scope

**In Scope:**
- Fix `useEpubFromBook` loading-state race condition (one-line derived-state change)
- Add XML 1.0 control-character sanitisation to `bookToEpub.ts`
- Create unit tests for both `bookToEpubBuffer` and `useEpubFromBook`
- Verify existing `ReaderPage.test.tsx` tests still pass (no changes expected)

**Scope note (post-review):** Implementation and codebase have migrated to **epub.js**. As a result, `ReaderPage`, `useEpubReader`, `storage.keys.ts` (cache prefix bump), and `ReaderPage.test.tsx` were also touched; this spec’s file list and docs have been updated to reflect that. **We migrated to epub.js → docs need updating** wherever they still describe the previous reader engine.

**Out of Scope:**
- Multi-chapter EPUB structure (build-time script uses single-file; runtime should match)
- Changes to `build-epubs.mjs` (lower risk; string-based decoding avoids control chars)
- Catalog schema, service worker, crawler, or any server-side code

---

## Context for Development

### Codebase Patterns

- **StorageService (mandatory):** always `storageService` from `@/shared/services/storage.service` — never `import localforage`. `setItem` silently swallows `QuotaExceededError`; `getItem` returns `null` for missing keys.
- **Derived state:** prefer computing from existing state over adding a new `useState`. Avoids React initialisation timing issues.
- **useEffect cleanup:** `let cancelled = true` pattern is already in `useEpubFromBook` — preserve it exactly. `URL.revokeObjectURL` in cleanup on `blobUrlRef.current`.
- **TypeScript strict:** no `any`, no unused vars/params, `verbatimModuleSyntax` (use `import type` where appropriate).
- **Test isolation:** colocate test files (`*.test.ts` beside the file being tested). Mock external deps with `vi.mock`. Use `vi.stubGlobal` for browser globals (`URL.createObjectURL`, `URL.revokeObjectURL`) not available in jsdom.
- **No direct DOM globals in lib code:** `bookToEpub.ts` is a pure utility — no `document`, no `window`. The `sanitizeXml` function must be a pure string operation.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/shared/lib/bookToEpub.ts` | **Modify** — add `sanitizeXml`, apply to each paragraph |
| `apps/reader/src/features/reader/useEpubFromBook.ts` | **Modify** — derive `isLoading` from current state |
| `apps/reader/src/shared/lib/bookToEpub.test.ts` | **Create** — unit tests for EPUB generation |
| `apps/reader/src/features/reader/useEpubFromBook.test.ts` | **Create** — unit tests for the hook |
| `apps/reader/src/features/reader/ReaderPage.tsx` | **Read-only** — verify guard conditions still correct |
| `apps/reader/src/features/reader/ReaderPage.test.tsx` | **Verify** — run; no changes expected |
| `apps/reader/scripts/build-epubs.mjs` | **Reference** — canonical single-file EPUB structure to confirm parity |
| `apps/reader/src/shared/services/storage.service.ts` | **Reference** — StorageService interface |
| `apps/reader/src/shared/constants/storage.keys.ts` | **Reference** — `epubBlobCacheKey` helper |
| `apps/reader/src/shared/types/global.types.ts` | **Reference** — `Book` type (`id: string, title: string, content: string[]`) |
| `apps/reader/vitest.config.ts` | **Reference** — test environment (`jsdom`), setup file, `@` alias |
| `apps/reader/src/test-setup.ts` | **Reference** — `@testing-library/jest-dom`, `ResizeObserver` mock |

### Technical Decisions

1. **Derive `isLoading`, not reinitialise state:** `useState` only initialises once per component mount. Adding a `useLayoutEffect` to reset state synchronously or calling `useState(() => !!book)` (lazy initialiser) would still not handle the re-render case. The cleanest, lowest-risk fix is to compute the returned `isLoading` as `isLoading || (book !== null && epubUrl === null && error === null)`. This is a purely additive change — no existing logic is removed.

2. **`sanitizeXml` runs before `xmlEscape`:** Stripping control characters first then XML-escaping is safe and idempotent. Running in the reverse order would be safe too, but pre-sanitisation is cleaner (no risk of accidentally escaping a sequence that contains a forbidden char).

3. **Single-file XHTML kept:** `build-epubs.mjs` (build-time) also uses one `content.xhtml`. The runtime hook mirrors the build-time output. Splitting into chapters would diverge the two paths with no confirmed benefit.

4. **Cache key stays as `epubBlobCacheKey(book.id)`:** `book.id` after `bookSchema.transform` is the raw JSON's `id` (e.g. `"vbeta__bo-trung-quan"`), not the catalog UUID. This is stable and correct for caching.

---

## Implementation Plan

### Tasks

- [x] **Task 1: Add `sanitizeXml` helper and apply it in `bookToEpub.ts`**
  - File: `apps/reader/src/shared/lib/bookToEpub.ts`
  - Action: Add the following pure function between `xmlEscape` and `bookToEpubBuffer`:
    ```typescript
    function sanitizeXml(text: string): string {
      // Strip XML 1.0 forbidden control characters that DOMParser rejects
      // Allowed: U+0009 (tab), U+000A (LF), U+000D (CR)
      return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFE\uFFFF]/g, '')
    }
    ```
  - Action: In `bodyContent`, change the paragraph mapping from:
    ```typescript
    paragraphs.map((p) => `    <p>${xmlEscape(p)}</p>`)
    ```
    to:
    ```typescript
    paragraphs.map((p) => `    <p>${xmlEscape(sanitizeXml(p))}</p>`)
    ```
  - Notes: No other changes in this file. The EPUB structure (`content.opf`, `toc.ncx`, file layout) stays identical. Title and `uid` are also sanitized in `bookToEpubBuffer` for consistency with paragraph content.

- [x] **Task 2: Fix `isLoading` race condition in `useEpubFromBook.ts`**
  - File: `apps/reader/src/features/reader/useEpubFromBook.ts`
  - Action: Change the return statement at the bottom of the function from:
    ```typescript
    return { epubUrl, isLoading, error }
    ```
    to:
    ```typescript
    const derivedLoading = isLoading || (book !== null && epubUrl === null && error === null)
    return { epubUrl, isLoading: derivedLoading, error }
    ```
  - Notes: This is the entire change for this file. Do not touch `useState`, `useEffect`, or any other logic.

- [x] **Task 3: Create unit tests for `bookToEpubBuffer`**
  - File: `apps/reader/src/shared/lib/bookToEpub.test.ts` (new)
  - Action: Create test file with the following test cases. Use `jszip` (already in deps) to inspect the generated zip.
  - Test cases:
    - `bookToEpubBuffer returns an ArrayBuffer` — call with minimal book, assert `result instanceof ArrayBuffer`
    - `generated ZIP contains required EPUB files` — unzip and assert keys include `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/toc.ncx`, `OEBPS/content.xhtml`
    - `mimetype file is uncompressed (STORE method)` — inspect JSZip file metadata; `zip.files['mimetype']._data.compression.magic` or equivalent
    - `content.xhtml contains book title and paragraphs` — assert title and first paragraph appear in XHTML string
    - `sanitizeXml strips forbidden control characters` — pass a book with `content: ['hello\x08world']`; assert `content.xhtml` does NOT contain `\x08`
    - `empty content array produces valid EPUB with placeholder paragraph` — pass `content: []`; assert `content.xhtml` contains `<p></p>`
  - Notes: `bookToEpubBuffer` returns `Promise<ArrayBuffer>`. Use `await` in test. Mock nothing — this is a pure function test. Import JSZip to unzip and read generated files.

- [x] **Task 4: Create unit tests for `useEpubFromBook`**
  - File: `apps/reader/src/features/reader/useEpubFromBook.test.ts` (new)
  - Action: Create test file using `renderHook` from `@testing-library/react`.
  - Setup:
    ```typescript
    vi.mock('@/shared/lib/bookToEpub')
    vi.mock('@/shared/services/storage.service')
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    const mockRevokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL })
    ```
  - Test cases:
    - `returns isLoading: false and epubUrl: null when book is null` — render with `null`; assert `{ isLoading: false, epubUrl: null, error: null }`
    - `returns isLoading: true immediately when called with a non-null book (no parse-error flash)` — render with a valid `bookFixture`; assert `result.current.isLoading === true` BEFORE any await (synchronous check)
    - `sets epubUrl to blob URL after bookToEpubBuffer resolves` — mock `bookToEpubBuffer` to resolve with `new ArrayBuffer(8)`, mock `storageService.getItem` to return `null`; await act; assert `epubUrl === 'blob:mock-url'` and `isLoading === false`
    - `sets error when bookToEpubBuffer rejects` — mock `bookToEpubBuffer` to reject with `new Error('fail')`; await act; assert `error.message === 'fail'` and `isLoading === false` and `epubUrl === null`
    - `uses cached Blob and skips bookToEpubBuffer` — mock `storageService.getItem` to return a `new Blob([new ArrayBuffer(8)])`; assert `bookToEpubBuffer` not called
    - `calls revokeObjectURL on cleanup` — render, await act to set url, unmount; assert `mockRevokeObjectURL` called with `'blob:mock-url'`
  - Notes: `bookFixture` type is `Book` from `@/shared/types/global.types`. Use `{ id: 'test', title: 'T', category: 'K', subcategory: 's', translator: 'x', coverImageUrl: null, content: ['p1'] }`.

- [x] **Task 5: Verify `ReaderPage.test.tsx` still passes (no code changes)**
  - File: `apps/reader/src/features/reader/ReaderPage.test.tsx`
  - Action: Run `pnpm test -- --run src/features/reader/ReaderPage.test.tsx` and confirm all 14 tests pass. If any test fails due to changed `isLoading` derived behaviour, update mock return values to be consistent (but no logic changes in `ReaderPage.tsx`).
  - Notes: The `useEpubFromBook` mock in `ReaderPage.test.tsx` returns explicit `isLoading` values, so the derivation logic in the hook does not affect these tests. No test changes expected.

### Acceptance Criteria

- [ ] **AC 1:** Given the user navigates to `/read/5cb15d2a-94d8-4c10-840d-cd934ac19627` in dev mode (no pre-built epub)
  When the page loads and `useBook` resolves
  Then the loading skeleton appears (never the parse error page) while EPUB is being built
  And after EPUB is built, epub.js renders book content in the paginated reader
  _(Manual verification.)_

- [x] **AC 2:** Given `useEpubFromBook` is called and on first render `book` is non-null but the useEffect has not yet fired
  When the hook is evaluated
  Then `isLoading` returns `true`
  And `ReaderPage` shows the loading skeleton (not `<ReaderErrorPage category="parse" />`)

- [x] **AC 3:** Given a `Book` with `content` paragraphs containing XML 1.0 forbidden characters (e.g. `\x08`, `\x0B`)
  When `bookToEpubBuffer` is called
  Then `content.xhtml` in the generated ZIP does not contain any forbidden control characters
  And the returned ArrayBuffer is a valid EPUB 2.0 structure with all required files

- [x] **AC 4:** Given `useEpubFromBook` is called with `book = null`
  When the hook returns
  Then `isLoading` is `false`, `epubUrl` is `null`, and `error` is `null`

- [x] **AC 5:** Given `bookToEpubBuffer` throws an error
  When `useEpubFromBook`'s effect catches the error
  Then `error` is set to the caught error, `isLoading` is `false`, and `epubUrl` remains `null`

- [x] **AC 6:** Given `pnpm test` is run after the fix
  Then all tests pass with zero failures and zero lint warnings (`pnpm lint`)

---

## Additional Context

### Dependencies

- No new npm packages. `jszip` (already in `dependencies`) is used both in `bookToEpub.ts` and in tests to parse the generated EPUB zip.
- `@testing-library/react` (already in `devDependencies`) provides `renderHook` for hook tests.
- No changes to `package.json`, `vite.config.ts`, or `vitest.config.ts`.

### Testing Strategy

**Unit tests (automated):**
- `bookToEpub.test.ts` — pure function; no mocks needed except `jszip` is used to parse output. Runs in jsdom.
- `useEpubFromBook.test.ts` — hook test; mocks `bookToEpubBuffer`, `storageService`, and `URL` globals. Runs in jsdom.
- `ReaderPage.test.tsx` — existing tests; run without changes to confirm no regression.

**Manual verification:**
1. Start dev server: `devbox run dev` (runs `concurrently "node scripts/mock-server.mjs" "vite"`)
2. Open `http://localhost:5173/read/5cb15d2a-94d8-4c10-840d-cd934ac19627`
3. Expected: loading skeleton → epub.js renders Buddhist text (not the parse error page)
4. Open browser DevTools → Application → IndexedDB → verify `epub_blob_vbeta__bo-trung-quan` cached entry appears after first load

### Notes

- **epub.js migration:** We migrated to epub.js; **docs need updating** wherever they still reference the previous reader engine (architecture, UX, or runbooks).
- **If the parse error persists after both fixes:** The epub.js failure may be caused by something other than XML control characters. Next debugging step: add `console.error('[useEpubReader] openFailed:', err)` inside the `bookInstance.on('openFailed', ...)` handler to inspect the actual error message from epub.js in the browser console.
- **Cache invalidation:** If a broken EPUB was previously cached in IndexedDB under key `epub_blob_vbeta__bo-trung-quan`, the fix won't help until that cache entry is cleared. Clear via Settings → "Xóa bộ nhớ đệm" or clear browser storage manually.
- **`build-epubs.mjs` not fixed:** The build-time script has the same missing XML sanitisation but uses a simpler entity decoder (no DOM) that's less likely to introduce control chars. Fixing it separately is out of scope.
