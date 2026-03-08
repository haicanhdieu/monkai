# Story 4.5: Bookmarks View

Status: done

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

- [x] Task 1: Implement BookmarksPage with real data (AC: 1, 4)
  - [x] Replace the placeholder in `apps/reader/src/features/bookmarks/BookmarksPage.tsx`
  - [x] Import `useBookmarksStore` from `@/stores/bookmarks.store`
  - [x] Read `bookmarks` from store, sort by `timestamp` descending
  - [x] If `bookmarks.length === 0`: render empty state UI
  - [x] If `bookmarks.length > 0`: render sorted list of `<BookmarkCard>` components
  - [x] Page title: "Đánh Dấu"

- [x] Task 2: Create BookmarkCard component (AC: 2, 3)
  - [x] Created `apps/reader/src/features/bookmarks/BookmarkCard.tsx`
  - [x] Renders as `<Link>` to `/read/:bookId` with Lora font, page number (1-indexed), relative timestamp
  - [x] min-h-[44px] tap target enforced

- [x] Task 3: Create relative timestamp helper (AC: 2)
  - [x] Created `apps/reader/src/shared/utils/time.ts`
  - [x] `formatRelativeTime` with Vietnamese strings, pure arithmetic, no library

- [x] Task 4: Implement empty state (AC: 4)
  - [x] BookmarkIcon, message, "Khám phá Thư Viện" link

- [x] Task 5: Confirm upsert bookmark wiring (AC: 5)
  - [x] Verified — wired in Story 4.2's `ReaderEngine.tsx` via `persistPageChange`

- [x] Task 6: Write tests (AC: 1, 2, 4)
  - [x] Created `apps/reader/src/features/bookmarks/BookmarksPage.test.tsx` — 9 tests pass

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

All 6 tasks completed. Full BookmarksPage with sorted bookmark list, BookmarkCard component, formatRelativeTime utility, empty state UI, and comprehensive tests. 9/9 tests pass.

### File List

- apps/reader/src/features/bookmarks/BookmarksPage.tsx (modified — full implementation replacing placeholder)
- apps/reader/src/features/bookmarks/BookmarkCard.tsx (new)
- apps/reader/src/features/bookmarks/BookmarksPage.test.tsx (new)
- apps/reader/src/shared/utils/time.ts (new)
