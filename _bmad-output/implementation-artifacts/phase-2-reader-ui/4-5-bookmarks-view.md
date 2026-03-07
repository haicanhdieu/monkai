# Story 4.5: Bookmarks View

Status: ready-for-dev

## Story

As a **user**,
I want to see all my saved reading positions in one place,
so that I can quickly return to any sutra I was reading without searching for it again.

## Acceptance Criteria

1. **Given** the user taps the "Đánh Dấu" tab
   **When** `BookmarksPage` renders
   **Then** it displays a list of `<BookmarkCard>` components, one per saved position, sorted by most recently read (highest `timestamp` first)

2. **Given** `<BookmarkCard>` for a saved position
   **When** rendered
   **Then** it shows: book title (Lora font), page number, and relative timestamp (e.g., "2 giờ trước"), with a minimum 44×44px tap target

3. **Given** the user taps a `<BookmarkCard>`
   **When** navigation occurs
   **Then** they land on `/read/:bookId` and the reader opens at the exact saved page

4. **Given** no bookmarks exist yet
   **When** `BookmarksPage` renders
   **Then** an empty state message is shown: "Chưa có đánh dấu nào. Hãy bắt đầu đọc một bản kinh!" with a button to the Library

5. **Given** `bookmarks.store.ts` in Zustand with `immer` middleware
   **When** `setCurrentPage` fires in `reader.store`
   **Then** `bookmarks.store.upsertBookmark({ bookId, bookTitle, page, timestamp })` is called — one bookmark per book (upsert, not append)

## Tasks / Subtasks

- [ ] Task 1: Implement BookmarksPage with real data (AC: 1, 4)
  - [ ] Replace the placeholder in `apps/reader/src/features/bookmarks/BookmarksPage.tsx`
  - [ ] Import `useBookmarksStore` from `@/stores/bookmarks.store`
  - [ ] Read `bookmarks` from store, sort by `timestamp` descending
  - [ ] If `bookmarks.length === 0`: render empty state UI
  - [ ] If `bookmarks.length > 0`: render sorted list of `<BookmarkCard>` components
  - [ ] Page title: "Đánh Dấu" with the standard page header pattern (match LibraryPage or SettingsPage style)

- [ ] Task 2: Create BookmarkCard component (AC: 2, 3)
  - [ ] Create `apps/reader/src/features/bookmarks/BookmarkCard.tsx`
  - [ ] Props: `bookmark: Bookmark` (import `Bookmark` type from `@/stores/bookmarks.store`)
  - [ ] Render as a `<Link>` to `/read/:bookId` (use `toRead(bookmark.bookId)` from routes)
  - [ ] Book title: Lora serif font (`style={{ fontFamily: 'Lora, serif' }}`)
  - [ ] Page number: "Trang {bookmark.page + 1}" (pages are 0-indexed in store, display 1-indexed to user)
  - [ ] Timestamp: relative format using `formatRelativeTime(bookmark.timestamp)` helper (see below)
  - [ ] Minimum tap target: `min-h-[44px]` on the link element
  - [ ] Style consistently with the app's card pattern (rounded-2xl, border, surface background)

- [ ] Task 3: Create relative timestamp helper (AC: 2)
  - [ ] Create `apps/reader/src/shared/utils/time.ts` (or add to an existing utils file if one exists)
  - [ ] Function: `formatRelativeTime(timestamp: number): string`
  - [ ] Return Vietnamese relative strings:
    - < 60s: "vừa xong"
    - < 60min: "{n} phút trước"
    - < 24h: "{n} giờ trước"
    - < 7d: "{n} ngày trước"
    - >= 7d: "{n} tuần trước"
  - [ ] NO external date library — implement with simple arithmetic using `Date.now() - timestamp`

- [ ] Task 4: Implement empty state (AC: 4)
  - [ ] When `bookmarks.length === 0`, render:
    - Centered icon (BookmarkIcon from @radix-ui/react-icons or a simple SVG)
    - Message: "Chưa có đánh dấu nào. Hãy bắt đầu đọc một bản kinh!"
    - Button/Link to ROUTES.LIBRARY: "Khám phá Thư Viện" styled as a primary action button
  - [ ] Match the empty state visual pattern used elsewhere in the app (if any)

- [ ] Task 5: Confirm upsert bookmark wiring (AC: 5)
  - [ ] This is a verification + cleanup task — the upsert should have been wired in Story 4.2 (Task 2)
  - [ ] Verify that `ReaderEngine.tsx` correctly calls `useBookmarksStore.getState().upsertBookmark(...)` on page turn
  - [ ] Verify that the bookmark is persisted to storage via `storageService.setItem(STORAGE_KEYS.BOOKMARKS, ...)`
  - [ ] If Story 4.2 is not complete, implement the wiring here:
    - In `ReaderEngine.tsx`, on `setCurrentPage(n)`, call `upsertBookmark({ bookId, bookTitle, page: n, timestamp: Date.now() })`
    - Then call `storageService.setItem(STORAGE_KEYS.BOOKMARKS, useBookmarksStore.getState().bookmarks)`

- [ ] Task 6: Write tests (AC: 1, 2, 4)
  - [ ] Create `apps/reader/src/features/bookmarks/BookmarksPage.test.tsx`
  - [ ] Test: empty state renders when `bookmarks = []`
  - [ ] Test: BookmarkCard renders for each bookmark, sorted by timestamp descending
  - [ ] Test: BookmarkCard link navigates to correct URL
  - [ ] Test: `formatRelativeTime` unit test for each time bucket

## Dev Notes

### Critical Context

**Prerequisites**: Stories 4.1 and 4.2 must be complete first:
- `bookmarks.store.ts` (created in 4.1)
- `upsertBookmark` wiring in `ReaderEngine.tsx` (4.2 Task 2)
- `STORAGE_KEYS.BOOKMARKS` persistence (4.2 Task 2)
- `Bookmark` type defined in `bookmarks.store.ts`

**Current BookmarksPage.tsx state** (from code review):
```typescript
// CURRENT — just a placeholder:
export default function BookmarksPage() {
    return <div className="p-4">Đánh Dấu (placeholder)</div>
}
```
Replace entirely.

**Story 4.2 may have implemented a partial stub** — check if it already has basic data wiring. If so, build on it rather than replacing.

**Bookmark type** (defined in Story 4.1 `bookmarks.store.ts`):
```typescript
export interface Bookmark {
  bookId: string       // e.g., 'kinh-phap-hoa'
  bookTitle: string    // e.g., 'Kinh Pháp Hoa'
  page: number         // 0-indexed current page in reader
  timestamp: number    // Date.now() at time of last read
}
```

**Page number display**: `page` in store is 0-indexed (matches `currentPage` in reader.store). Display to user as 1-indexed: `bookmark.page + 1`. Show as "Trang {bookmark.page + 1}".

**Sorting**: `[...bookmarks].sort((a, b) => b.timestamp - a.timestamp)` — most recently read first. Do NOT mutate store array directly.

**BookmarkCard expected markup** (approximate):
```tsx
// apps/reader/src/features/bookmarks/BookmarkCard.tsx
import { Link } from 'react-router-dom'
import { toRead } from '@/shared/constants/routes'
import { formatRelativeTime } from '@/shared/utils/time'
import type { Bookmark } from '@/stores/bookmarks.store'

interface BookmarkCardProps {
  bookmark: Bookmark
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  return (
    <Link
      to={toRead(bookmark.bookId)}
      className="flex min-h-[44px] flex-col gap-1 rounded-2xl border p-4 transition-colors hover:brightness-95"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <span className="text-base font-semibold" style={{ fontFamily: 'Lora, serif' }}>
        {bookmark.bookTitle}
      </span>
      <div className="flex items-center justify-between text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <span>Trang {bookmark.page + 1}</span>
        <span>{formatRelativeTime(bookmark.timestamp)}</span>
      </div>
    </Link>
  )
}
```

**formatRelativeTime implementation**:
```typescript
// apps/reader/src/shared/utils/time.ts
export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)

  if (diffSec < 60) return 'vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  if (diffHour < 24) return `${diffHour} giờ trước`
  if (diffDay < 7) return `${diffDay} ngày trước`
  return `${diffWeek} tuần trước`
}
```

**Routes — `toRead` helper**: Already exists in `@/shared/constants/routes.ts` (used in HomePage.tsx). Import and use it.

**ROUTES.LIBRARY**: Already defined in routes constants. Use for the empty state "go to Library" button.

**BottomNav tab for Bookmarks**: The bottom navigation already has "Dấu Trang" tab linking to ROUTES.BOOKMARKS. No changes needed to navigation.

**Empty state style** — match the visual calmness of the app:
```tsx
<div className="flex flex-col items-center justify-center gap-6 px-8 py-20 text-center">
  <BookmarkIcon className="h-12 w-12" style={{ color: 'var(--color-text-muted)' }} />
  <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
    Chưa có đánh dấu nào. Hãy bắt đầu đọc một bản kinh!
  </p>
  <Link
    to={ROUTES.LIBRARY}
    className="rounded-full px-6 py-3 text-sm font-semibold text-white"
    style={{ backgroundColor: 'var(--color-accent)' }}
  >
    Khám phá Thư Viện
  </Link>
</div>
```

### Project Structure Notes

New files to create:
- `apps/reader/src/features/bookmarks/BookmarkCard.tsx`
- `apps/reader/src/features/bookmarks/BookmarksPage.test.tsx`
- `apps/reader/src/shared/utils/time.ts` (or add to existing utils if present)

Files to modify:
- `apps/reader/src/features/bookmarks/BookmarksPage.tsx` — replace placeholder with full implementation

### Architecture Compliance

- `BookmarkCard` stays inside `features/bookmarks/` — it is not a truly shared component
- `formatRelativeTime` goes in `shared/utils/` — a pure utility function usable across features
- Import `Bookmark` type from `@/stores/bookmarks.store` using `@/` absolute import
- Use `toRead(bookId)` from routes — not string template literals for navigation URLs
- No cross-feature component imports — `BookmarkCard` is private to the `bookmarks` feature
- Minimum 44×44px tap target enforced by `min-h-[44px]` on the `<Link>` (architecture NFR)
- Lora font for book title — matches the rest of the reading experience

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 4.5]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Component Architecture - BookmarksView]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Non-Functional Requirements - 44px touch targets]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md#Journey 3: The Dedicated Student]
- [Source: apps/reader/src/features/bookmarks/BookmarksPage.tsx — current placeholder]
- [Source: apps/reader/src/shared/constants/routes.ts — toRead() helper]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
