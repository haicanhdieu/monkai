---
title: 'UI Bug Fixes - Reader Polish'
slug: 'bug-fixes-ui-polish'
created: '2026-03-13'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - React 18 + TypeScript
  - Tailwind CSS
  - '@radix-ui/react-icons'
  - '@radix-ui/react-dialog'
  - localforage
  - localStorage (native)
files_to_modify:
  - apps/reader/src/features/home/HomePage.tsx
  - apps/reader/src/features/library/SutraListCard.tsx
  - apps/reader/src/features/reader/ChromelessLayout.tsx
  - apps/reader/src/features/settings/OfflineStorageInfo.tsx
code_patterns:
  - CSS variables for all colors (--color-text, --color-surface, --color-border, --color-accent, --color-text-muted)
  - Radix UI icons at h-4 w-4 with aria-hidden="true"
  - min-h-[44px] tap target minimum
  - useEffect with fake-timer-friendly cleanup for auto-hide patterns
  - localStorage for simple persisted boolean flags (sync, no async overhead)
test_patterns:
  - Vitest + @testing-library/react
  - vi.useFakeTimers() + vi.advanceTimersByTime() for timer tests
  - getByRole / getByTestId for element queries
  - vi.mock() for module-level mocks (localforage, react-query)
  - await waitFor() for async Dialog interaction assertions
---

# Tech-Spec: UI Bug Fixes - Reader Polish

**Created:** 2026-03-13

## Overview

### Problem Statement

Five UI bugs are degrading the reading experience:
1. Continue Reading card: book covers can overflow to full screen width when the card content is tall.
2. Category detail book list: each item displays `book_seo_name` (slug like `kinh-dieu-phap-lien-hoa`) in the `subcategory` field — confusing to users.
3. Reader header bar: back button shows verbose "← Thư viện" label; TOC button shows plain text "Mục lục" instead of an icon.
4. Reader screen: the first-open hint ("Chạm vào giữa màn hình") never auto-hides and re-appears on every book open — not just the first time; no left/right page-turn hints are shown.
5. Settings → Clear Cache: uses `window.confirm` (native browser dialog) and does NOT clear localforage (where epub blobs and reading state are stored), so storage usage appears unchanged after confirm.

### Solution

Targeted fixes in four files:
- `HomePage.tsx`: cap cover width at 40% of card via `maxWidth: '40%'` on the cover container.
- `SutraListCard.tsx`: delete the `{book.subcategory}` paragraph.
- `ChromelessLayout.tsx`: strip back-button label (replace with `ArrowLeftIcon`); replace "Mục lục" text with `ListBulletIcon`; persist hint-seen flag in `localStorage`; auto-hide hints after `CHROME_AUTOHIDE_MS`; add left/right navigation hints with correct directions.
- `OfflineStorageInfo.tsx`: replace `window.confirm` with Radix UI `Dialog`; fix `handleClearCache` to add `localforage.clear()` and an error state; guard trigger button while dialog is open.

### Scope

**In Scope:**
- Cover max-width constraint on Home ContinueReadingCard
- Remove SEO id text from SutraListCard
- Back button label removal (reader header)
- TOC button icon replacement (reader header)
- First-open hint: persist across mounts, auto-hide, add correct left/right navigation hints
- In-app confirmation dialog for clear cache
- Fix clear-cache to also wipe localforage
- Error state when cache clear fails

**Out of Scope:**
- SearchResults card layout changes
- Reader engine navigation logic
- Category page redesign
- Any new features beyond the five described bugs

---

## Context for Development

### Codebase Patterns

- **Theming**: all colors via CSS variables — `var(--color-text)`, `var(--color-accent)`, `var(--color-surface)`, `var(--color-border)`, `var(--color-text-muted)`. Never use hardcoded colors.
- **Icons**: from `@radix-ui/react-icons`. Existing usage: `h-4 w-4` or `h-5 w-5`, always `aria-hidden="true"`. Accessibility handled by `aria-label` on the parent button.
- **Tap targets**: `min-h-[44px]` is the project standard.
- **Auto-hide timers**: `ChromelessLayout` already has a working pattern — `useEffect` on mount with `setTimeout` + cleanup `clearTimeout`. Hint auto-hide follows the same pattern.
- **Persisting simple boolean flags**: use `localStorage` directly (sync, no async overhead). `localforage` is for structured data (epub blobs, reading positions). A simple boolean hint-seen flag belongs in `localStorage`.
- **`localforage`**: imported directly from `'localforage'` package; the `storageService` wrapper is NOT needed for `localforage.clear()` — call it directly.
- **Radix Dialog**: `@radix-ui/react-dialog` is installed. Use `Dialog.Root / Portal / Overlay / Content / Title / Description`. Style with inline CSS variables, not Tailwind component classes.
- **ReaderEngine tap zones** (confirmed from `ReaderEngine.tsx`): left 20% → `rendition.prev()` (previous page), right 20% → `rendition.next()` (next page). Navigation hints must match this convention.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/features/home/HomePage.tsx` | `ContinueReadingCard` + `useCoverDimensions` hook — Bug 1 |
| `apps/reader/src/features/library/SutraListCard.tsx` | Category book list item — Bug 2 |
| `apps/reader/src/shared/schemas/catalog.schema.ts` | Maps `book_seo_name` → `CatalogBook.subcategory` (root cause of Bug 2) |
| `apps/reader/src/features/reader/ChromelessLayout.tsx` | Reader header, hint state, chrome auto-hide — Bugs 3.1–3.3 |
| `apps/reader/src/features/reader/ReaderEngine.tsx` | Confirms tap zone directions: left = prev, right = next |
| `apps/reader/src/features/reader/ChromelessLayout.test.tsx` | Existing tests — 2 need updates, 2 new tests needed |
| `apps/reader/src/features/settings/OfflineStorageInfo.tsx` | Clear cache button — Bug 4 |
| `apps/reader/src/features/settings/OfflineStorageInfo.test.tsx` | Existing tests — 2 need rewrites, 1 new assertion needed |
| `apps/reader/src/shared/services/storage.service.ts` | localforage wrapper (reference only — not modified) |

### Technical Decisions

- **Cover max-width (Bug 1)**: Add `style={{ maxWidth: '40%' }}` to the outer cover flex div (`<div className="flex min-h-0 items-stretch">`), which is the direct grid item. In practice, major browsers resolve `max-width` percentages on grid items against the grid container's definite inline size when an `auto` track would otherwise create a circular dependency — and the `<Link>` card is a definite-width block element in normal document flow. Both the `coverDimensions` and null-fallback branches sit inside this container and both benefit.

- **SEO id removal (Bug 2)**: Delete the `<p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>{book.subcategory}</p>` block from `SutraListCard.tsx`. No schema changes — `CatalogBook.subcategory` stays mapped from `book_seo_name` for potential future use; it just won't render.

- **Back button (Bug 3.1)**: Remove text `← Thư viện`. Replace with `<ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />`. Add `p-2` to the button className for tap area. Keep `aria-label="Về Thư viện"`.

- **TOC icon (Bug 3.2)**: Replace text `Mục lục` with `<ListBulletIcon className="h-4 w-4" aria-hidden="true" />`. Add `p-2` to button className. Keep `aria-label="Mở mục lục"`.

- **Hint persistence + auto-hide (Bug 3.3)**: `hasSeenHint` must survive component remounts (user navigating away and back). Use `localStorage` with key `'reader_nav_hint_seen'`: initialize `useState` from `localStorage.getItem('reader_nav_hint_seen') === 'true'`; call `localStorage.setItem('reader_nav_hint_seen', 'true')` inside `dismissHint`. Add a mount-only `useEffect` that calls `dismissHint()` after `CHROME_AUTOHIDE_MS`. Note: both the chrome auto-hide timer AND the hint auto-hide timer fire at the same `CHROME_AUTOHIDE_MS` (3000 ms) — this is intentional; they control independent UI elements (`isChromeVisible` vs `hasSeenHint`) with no conflict.

- **Hint directions (Bug 3.3)**: Verified against `ReaderEngine.tsx`: left tap = `prev()`, right tap = `next()`. Hints must read: left pill = "Chạm trái → trang trước", right pill = "Chạm phải → trang tiếp".

- **Export `CHROME_AUTOHIDE_MS` (Bug 3.3)**: Change `const CHROME_AUTOHIDE_MS` to `export const CHROME_AUTOHIDE_MS` so tests can import it and stay in sync if the value ever changes.

- **Clear cache dialog (Bug 4)**: Add `showConfirm` state. On button click → `setShowConfirm(true)`. Disable the trigger button when `showConfirm || clearing` to prevent double-opens. Remove `window.confirm`. Add `clearError` state: set it in a `catch` block, display an inline error message, reset on next attempt. Fix `handleClearCache` to add `await localforage.clear()` and call `setShowConfirm(false)` is handled at the call site (confirm button onClick), not inside the function. Render a `Dialog.Root` styled with CSS variables.

- **`dismissHint` in useEffect**: `dismissHint` is `() => setHasSeenHint(true)` — a new arrow function on each render, NOT a stable reference. However, the empty `[]` dependency array is safe because the closure captures `setHasSeenHint`, which IS a stable React setState setter. The comment in code should reflect this: `// safe: closure captures stable setHasSeenHint setter`.

---

## Implementation Plan

### Tasks

- [x] Task 1: Remove SEO id display from category book list item
  - File: `apps/reader/src/features/library/SutraListCard.tsx`
  - Action: Delete the following block (currently lines 48–50):
    ```tsx
    <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
      {book.subcategory}
    </p>
    ```
  - Notes: `book.subcategory` is not rendered anywhere else in this file.

- [x] Task 2: Cap continue reading cover width at 40% of card
  - File: `apps/reader/src/features/home/HomePage.tsx`
  - Action: Change the outer cover flex div from:
    ```tsx
    <div className="flex min-h-0 items-stretch">
    ```
    to:
    ```tsx
    <div className="flex min-h-0 items-stretch" style={{ maxWidth: '40%' }}>
    ```
  - Notes: Both the `coverDimensions` branch and the null-fallback branch are children of this div and both get the constraint. No changes to `useCoverDimensions` or `COVER_ASPECT_RATIO`.

- [x] Task 3: Export `CHROME_AUTOHIDE_MS` and replace back button text with `ArrowLeftIcon`
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - Action:
    1. Change `const CHROME_AUTOHIDE_MS = 3000` → `export const CHROME_AUTOHIDE_MS = 3000`.
    2. Add import: `import { ArrowLeftIcon, ListBulletIcon } from '@radix-ui/react-icons'` (no icons are currently imported in this file).
    3. Back button: add `p-2` to its className string; replace content `← Thư viện` with `<ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />`.
    4. Keep `aria-label="Về Thư viện"` and all other props unchanged.

- [x] Task 4: Replace TOC button text with `ListBulletIcon`
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - Action:
    1. `ListBulletIcon` already imported in Task 3 — no additional import needed.
    2. TOC button: add `p-2` to its className string; replace content `Mục lục` with `<ListBulletIcon className="h-4 w-4" aria-hidden="true" />`.
    3. Keep `aria-label="Mở mục lục"` and all other props unchanged.

- [x] Task 5: Persist hint-seen flag, auto-hide hints, add left/right navigation hints
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - Action:
    1. Add constant at module level:
       ```ts
       const NAV_HINT_STORAGE_KEY = 'reader_nav_hint_seen'
       ```
    2. Replace the `FIRST_OPEN_HINT` constant with:
       ```ts
       const HINT_MESSAGES = {
         center: 'Chạm giữa để hiện menu',
         left: 'Chạm trái → trang trước',
         right: 'Chạm phải → trang tiếp',
       } as const
       ```
    3. Change the `hasSeenHint` / `dismissHint` declarations from:
       ```ts
       const [hasSeenHint, setHasSeenHint] = useState(false)
       const dismissHint = () => setHasSeenHint(true)
       ```
       to:
       ```ts
       const [hasSeenHint, setHasSeenHint] = useState(
         () => localStorage.getItem(NAV_HINT_STORAGE_KEY) === 'true'
       )
       const dismissHint = () => {
         localStorage.setItem(NAV_HINT_STORAGE_KEY, 'true')
         setHasSeenHint(true)
       }
       ```
    4. After the existing chrome auto-hide `useEffect`, add the hint auto-hide effect:
       ```ts
       useEffect(() => {
         const t = setTimeout(() => dismissHint(), CHROME_AUTOHIDE_MS)
         return () => clearTimeout(t)
         // safe: closure captures stable setHasSeenHint setter (dismissHint recreated each render but dep array intentionally empty)
       }, []) // eslint-disable-line react-hooks/exhaustive-deps
       ```
       Note: both this timer and the chrome auto-hide timer fire at `CHROME_AUTOHIDE_MS` simultaneously — intentional, they control independent UI state.
    5. Replace the existing first-open hint JSX (`{!hasSeenHint && (...)}`) with:
       ```tsx
       {!hasSeenHint && (
         <div
           className="pointer-events-none fixed inset-0 z-10"
           data-testid="chrome-hint"
           aria-hidden="true"
         >
           {/* Center hint */}
           <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
             <span
               className="text-xs px-4 py-2 rounded-full whitespace-nowrap"
               style={{
                 backgroundColor: 'var(--color-surface)',
                 color: 'var(--color-text-muted)',
                 border: '1px solid var(--color-border)',
               }}
             >
               {HINT_MESSAGES.center}
             </span>
           </div>
           {/* Left hint: left tap = previous page (confirmed from ReaderEngine.tsx) */}
           <div className="absolute bottom-24 left-4">
             <span
               className="text-xs px-4 py-2 rounded-full whitespace-nowrap"
               style={{
                 backgroundColor: 'var(--color-surface)',
                 color: 'var(--color-text-muted)',
                 border: '1px solid var(--color-border)',
               }}
             >
               {HINT_MESSAGES.left}
             </span>
           </div>
           {/* Right hint: right tap = next page (confirmed from ReaderEngine.tsx) */}
           <div className="absolute bottom-24 right-4">
             <span
               className="text-xs px-4 py-2 rounded-full whitespace-nowrap"
               style={{
                 backgroundColor: 'var(--color-surface)',
                 color: 'var(--color-text-muted)',
                 border: '1px solid var(--color-border)',
               }}
             >
               {HINT_MESSAGES.right}
             </span>
           </div>
         </div>
       )}
       ```

- [x] Task 6: Fix clear-cache — in-app Dialog, localforage.clear(), error state, guard button
  - File: `apps/reader/src/features/settings/OfflineStorageInfo.tsx`
  - Action:
    1. Add imports at the top:
       ```ts
       import * as Dialog from '@radix-ui/react-dialog'
       import localforage from 'localforage'
       ```
    2. Add state inside the component:
       ```ts
       const [showConfirm, setShowConfirm] = useState(false)
       const [clearError, setClearError] = useState(false)
       ```
    3. Rewrite `handleClearCache` — remove `window.confirm` guard, add `localforage.clear()`, add error handling:
       ```ts
       async function handleClearCache() {
         setClearError(false)
         setClearing(true)
         try {
           const keys = await caches.keys()
           await Promise.all(keys.map((key) => caches.delete(key)))
           queryClient.clear()
           await localforage.clear()
           await loadEstimate()
         } catch {
           setClearError(true)
         } finally {
           setClearing(false)
         }
       }
       ```
    4. Change the trigger button's `onClick` from `() => void handleClearCache()` to `() => setShowConfirm(true)`.
    5. Add `disabled={showConfirm || clearing}` to the trigger button to prevent double-opens.
    6. Add error message below the button (shown only when `clearError` is true):
       ```tsx
       {clearError && (
         <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
           Xóa thất bại — vui lòng thử lại.
         </p>
       )}
       ```
    7. Add the confirmation Dialog after the button (and the error message):
       ```tsx
       <Dialog.Root open={showConfirm} onOpenChange={setShowConfirm}>
         <Dialog.Portal>
           <Dialog.Overlay
             className="fixed inset-0 z-40"
             style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
           />
           <Dialog.Content
             className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-xl"
             style={{
               backgroundColor: 'var(--color-surface)',
               border: '1px solid var(--color-border)',
             }}
           >
             <Dialog.Title
               className="mb-2 text-base font-semibold"
               style={{ color: 'var(--color-text)' }}
             >
               Xóa bộ nhớ đệm
             </Dialog.Title>
             <Dialog.Description
               className="mb-6 text-sm"
               style={{ color: 'var(--color-text-muted)' }}
             >
               Toàn bộ dữ liệu đã lưu offline (sách, vị trí đọc, dấu trang) sẽ bị xóa. Tiếp tục?
             </Dialog.Description>
             <div className="flex justify-end gap-3">
               <Dialog.Close asChild>
                 <button
                   className="rounded-xl px-4 py-2 text-sm font-medium min-h-[44px]"
                   style={{
                     backgroundColor: 'var(--color-border)',
                     color: 'var(--color-text)',
                   }}
                 >
                   Huỷ
                 </button>
               </Dialog.Close>
               <button
                 className="rounded-xl px-4 py-2 text-sm font-medium min-h-[44px] text-white"
                 style={{ backgroundColor: 'var(--color-accent)' }}
                 onClick={() => {
                   setShowConfirm(false)
                   void handleClearCache()
                 }}
               >
                 Xóa
               </button>
             </div>
           </Dialog.Content>
         </Dialog.Portal>
       </Dialog.Root>
       ```

- [x] Task 7: Update breaking tests + add new tests
  - Files:
    - `apps/reader/src/features/reader/ChromelessLayout.test.tsx`
    - `apps/reader/src/features/settings/OfflineStorageInfo.test.tsx`

  **ChromelessLayout.test.tsx changes:**

  1. Add import at top: `import { CHROME_AUTOHIDE_MS } from '@/features/reader/ChromelessLayout'`.
  2. Add `localStorage.clear()` to `beforeEach` to reset hint persistence between tests.
  3. Line 101: update hint text assertion from `'Chạm vào giữa màn hình để hiện menu'` → `'Chạm giữa để hiện menu'`.
  4. Add new test after the "removes hint from DOM after first center-tap" test:
     ```ts
     it('auto-hides hint after CHROME_AUTOHIDE_MS ms', () => {
       renderLayout()
       expect(screen.getByTestId('chrome-hint')).toBeInTheDocument()
       act(() => { vi.advanceTimersByTime(CHROME_AUTOHIDE_MS) })
       expect(screen.queryByTestId('chrome-hint')).not.toBeInTheDocument()
     })
     ```
     Note: advancing by `CHROME_AUTOHIDE_MS` also triggers the chrome auto-hide timer — this is fine; the test only asserts on `chrome-hint`, not chrome visibility.

  **OfflineStorageInfo.test.tsx changes:**

  1. Add module mock at the top of the file (alongside existing mocks):
     ```ts
     const mockLocalforageClear = vi.fn()
     vi.mock('localforage', () => ({
       default: { clear: mockLocalforageClear },
     }))
     ```
  2. Add `mockLocalforageClear.mockResolvedValue(undefined)` and `mockLocalforageClear.mockClear()` to `beforeEach`.
  3. Remove `vi.stubGlobal('confirm', ...)` from the two affected tests.
  4. Rewrite "triggers cache clearing" test:
     ```ts
     it('"Xóa bộ nhớ đệm" button opens dialog; confirm clears all caches', async () => {
       const user = userEvent.setup()
       vi.stubGlobal('navigator', {
         ...navigator,
         storage: {
           estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 50000000 }),
         },
       })
       mockCachesKeys.mockResolvedValue(['book-data', 'precache'])

       render(<OfflineStorageInfo />)

       await user.click(screen.getByRole('button', { name: /Xóa bộ nhớ đệm/i }))
       // Dialog should be open — find and click the confirm button
       const confirmBtn = await screen.findByRole('button', { name: /^Xóa$/ })
       await user.click(confirmBtn)

       await waitFor(() => {
         expect(mockCachesKeys).toHaveBeenCalled()
         expect(mockCachesDelete).toHaveBeenCalledWith('book-data')
         expect(mockCachesDelete).toHaveBeenCalledWith('precache')
         expect(mockClear).toHaveBeenCalled()
         expect(mockLocalforageClear).toHaveBeenCalled()
       })
     })
     ```
  5. Rewrite "does not clear cache when cancelled" test:
     ```ts
     it('does not clear cache when user cancels dialog', async () => {
       const user = userEvent.setup()
       vi.stubGlobal('navigator', {
         ...navigator,
         storage: {
           estimate: vi.fn().mockResolvedValue({ usage: 1000, quota: 50000000 }),
         },
       })

       render(<OfflineStorageInfo />)

       await user.click(screen.getByRole('button', { name: /Xóa bộ nhớ đệm/i }))
       const cancelBtn = await screen.findByRole('button', { name: /Huỷ/i })
       await user.click(cancelBtn)

       expect(mockCachesKeys).not.toHaveBeenCalled()
       expect(mockClear).not.toHaveBeenCalled()
       expect(mockLocalforageClear).not.toHaveBeenCalled()
     })
     ```

---

### Acceptance Criteria

- [x] AC 1: Given the Continue Reading card has loaded with any book, when rendered at any viewport width, then the cover image/placeholder width is never greater than 40% of the card's total width, and the aspect ratio (2:3) and ResizeObserver sizing logic are unchanged.

- [x] AC 2: Given a category detail page with books loaded, when the page renders, then each list item shows the book title and translator only — no slug, SEO id, or `book_seo_name` value is visible.

- [x] AC 3.1: Given the reader screen is open and chrome is visible, when the user views the top-left of the header bar, then only a left-arrow icon is shown (no "Thư viện" text), and the button retains `aria-label="Về Thư viện"`.

- [x] AC 3.2: Given the reader screen is open with a book that has a TOC, when the user views the top-right of the header bar, then only a list-bullet icon is shown (no "Mục lục" text), and the button retains `aria-label="Mở mục lục"`.

- [x] AC 3.3a: Given a user opens a book for the FIRST time ever (no `reader_nav_hint_seen` key in localStorage), when `CHROME_AUTOHIDE_MS` (3 seconds) elapses, then all three hints disappear automatically. On subsequent book opens, hints do NOT appear.

- [x] AC 3.3b: Given the hints are visible, when the user taps the center tap zone, then all three hints disappear immediately and `localStorage.getItem('reader_nav_hint_seen')` equals `'true'`.

- [x] AC 3.3c: Given a first-time book open and hints are visible, then three pills are shown: one centered at the bottom ("Chạm giữa để hiện menu"), one bottom-left ("Chạm trái → trang trước"), one bottom-right ("Chạm phải → trang tiếp").

- [x] AC 4a: Given the user is on the Settings page, when the user taps "Xóa bộ nhớ đệm", then an in-app modal dialog appears — no native browser `window.confirm` is triggered.

- [x] AC 4b: Given the confirmation dialog is open, when the user taps "Huỷ", then the dialog closes and `caches.delete`, `queryClient.clear`, and `localforage.clear` are NOT called.

- [x] AC 4c: Given the confirmation dialog is open, when the user taps "Xóa", then the dialog closes and all three stores are cleared: SW caches (`caches.keys` + `caches.delete`), React Query cache (`queryClient.clear`), and localforage (`localforage.clear`), followed by a storage estimate refresh.

- [x] AC 4d: Given `handleClearCache` throws during execution, when the error is caught, then an inline error message "Xóa thất bại — vui lòng thử lại." is displayed below the button, and the button returns to its normal enabled state.

- [x] AC 4e: Given the confirmation dialog is already open, when the user somehow re-triggers the trigger button (e.g., keyboard), then nothing happens — the button is disabled while `showConfirm` or `clearing` is true.

---

## Additional Context

### Dependencies

- `@radix-ui/react-dialog ^1.1.15` — already in `apps/reader/package.json`, no install needed.
- `localforage` — already a direct dependency, importable directly.
- `ArrowLeftIcon`, `ListBulletIcon` — both confirmed present in `@radix-ui/react-icons@1.3.2`.
- `localStorage` — native browser API, no package needed; available in test environment (jsdom).

### Testing Strategy

**Tests unaffected by these changes:**
- `ChromelessLayout.test.tsx`: back button tests (query by `aria-label`), TOC trigger tests (query by `data-testid`), chrome auto-hide timer test, chrome visibility tests — all pass unchanged after adding `localStorage.clear()` to `beforeEach`.

**Tests that break and must be fixed (Task 7):**
- `ChromelessLayout.test.tsx` line 101: hint text assertion — update string to `'Chạm giữa để hiện menu'`.
- `OfflineStorageInfo.test.tsx` lines 66/91: `window.confirm` stubs — both tests fully rewritten to interact with the Dialog.

**New tests to add (Task 7):**
- `ChromelessLayout.test.tsx`: hint auto-hides via `CHROME_AUTOHIDE_MS` timer (imported constant, not hardcoded).
- `OfflineStorageInfo.test.tsx`: `localforage.clear()` is called on confirm (asserted in rewritten test).

### Notes

- **localStorage in test environment**: jsdom provides `localStorage`. Add `localStorage.clear()` to `beforeEach` in `ChromelessLayout.test.tsx` to prevent hint persistence from leaking between tests.
- **Two timers firing at same time**: chrome auto-hide (`toggleChrome`) and hint auto-hide (`dismissHint`) both fire at `CHROME_AUTOHIDE_MS`. This is correct and intentional — they are independent. Tests asserting on one element are not affected by the other timer firing.
- **`dismissHint` closure**: `dismissHint` is recreated each render. The empty `[]` dep array in the hint auto-hide `useEffect` is safe because the closure captures `setHasSeenHint`, which is a stable React setter. The `localStorage.setItem` call inside `dismissHint` is also fine since `NAV_HINT_STORAGE_KEY` is a module-level constant.
- **Dialog Portal in tests**: Radix `Dialog.Portal` renders into `document.body` — Testing Library's queries traverse the full document, so `findByRole('button', { name: /^Xóa$/ })` will find the confirm button regardless of portal placement. Use `findByRole` (async) rather than `getByRole` to wait for the portal to mount.

## Review Notes
- Adversarial review completed
- Findings: 8 total, 5 fixed, 3 skipped
- Resolution approach: auto-fix
- Fixed: F1 (hint timer guard), F2 (clearError reset on open), F3 (loadEstimate moved to finally), F5 (z-index made explicit), F6 (subcategory omission comment)
- Skipped: F4 (pre-existing layout concern, not introduced by diff), F7 (export required by spec for test/code sync), F8 (undecided — intentional minimalist design)
