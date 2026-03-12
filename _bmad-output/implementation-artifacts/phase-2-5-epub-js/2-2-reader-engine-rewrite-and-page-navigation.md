# Story 2.2: ReaderEngine Rewrite and Page Navigation

Status: ready-for-dev

## Story

As a reader user,
I want to navigate through a sutra's pages by tapping left/right zones or using keyboard arrows,
so that reading feels natural and fluid on both mobile and desktop.

## Acceptance Criteria

1. **Given** `ReaderEngine.tsx` is rewritten to consume `useEpubReader(epubUrl)`
   **When** the component mounts
   **Then** a `<div ref={containerRef}>` fills the available reader area and epub.js renders EPUB content into it
   **And** `lib/pagination/` (`paginateBook.ts`, `paginateBook.test.ts`, `pagination.types.ts`) and `useDOMPagination.ts` no longer exist in the codebase

2. **Given** the epub.js rendition is ready
   **When** the user taps in the left 20% of the screen
   **Then** `rendition.prev()` is called via `rendition.on('click')` zone detection
   **And** the page visually advances to the previous page

3. **Given** the epub.js rendition is ready
   **When** the user taps in the right 80%–100% zone
   **Then** `rendition.next()` is called and the page advances to the next page

4. **Given** the reader is focused on desktop
   **When** the user presses ArrowRight or PageDown
   **Then** `rendition.next()` is called via `rendition.on('keyup')`
   **When** the user presses ArrowLeft or PageUp
   **Then** `rendition.prev()` is called

5. **Given** the user taps in the center zone (20%–80%)
   **When** the tap event fires
   **Then** `readerStore.toggleChrome()` is called, toggling the chrome visibility

6. **Given** `ReaderPage.tsx` is updated
   **When** a sutra is opened
   **Then** `epubUrl` is read from the validated `CatalogBook` and passed to `ReaderEngine`
   **And** `ReaderEngine` never constructs the EPUB URL itself

## Tasks / Subtasks

- [ ] Delete `src/lib/pagination/paginateBook.ts` (AC: 1)
- [ ] Delete `src/lib/pagination/paginateBook.test.ts` (AC: 1)
- [ ] Delete `src/lib/pagination/pagination.types.ts` (AC: 1)
- [ ] Delete `src/lib/pagination/index.ts` (AC: 1)
- [ ] Delete `src/features/reader/useDOMPagination.ts` (AC: 1)
- [ ] Rewrite `src/features/reader/ReaderEngine.tsx` (AC: 1, 2, 3, 4, 5)
  - [ ] Accept `epubUrl: string` as the only required prop
  - [ ] Render `<div ref={containerRef} style={{ width: '100%', height: '100%' }} />`
  - [ ] Call `useEpubReader(epubUrl)` → destructure `{ containerRef, rendition, isReady, error }`
  - [ ] Wire `rendition.on('click')` for tap zone navigation + chrome toggle (when `rendition` is non-null)
  - [ ] Wire `rendition.on('keyup')` for keyboard navigation
  - [ ] Show `<SkeletonText>` while `!isReady && !error`
  - [ ] Show `<ReaderErrorPage>` when `error !== null`
  - [ ] For now, `rendition.on('relocated')` can be a no-op placeholder (`// TODO: Story 3.2 — progress save`)
- [ ] Rewrite `src/features/reader/ReaderEngine.test.tsx` (AC: 1, 2, 3, 4, 5)
  - [ ] Mock `useEpubReader` hook
  - [ ] Test skeleton shown when `isReady: false`
  - [ ] Test error page shown when `error` set
  - [ ] Test that container div is rendered with ref
- [ ] Update `src/features/reader/ReaderPage.tsx` (AC: 6)
  - [ ] Read catalog via `useCatalogIndex()` and find the book entry by `bookId` to get `epubUrl`
  - [ ] Pass `epubUrl` to `<ReaderEngine epubUrl={epubUrl ?? ''} />`
  - [ ] Remove references to `book.content` (paragraphs no longer needed by ReaderEngine)
  - [ ] Handle `epubUrl` being undefined (show error state)
- [ ] Run `pnpm typecheck` — zero errors (AC: 1)
- [ ] Run `pnpm test` (AC: 1)

## Dev Notes

### Codebase Context

**Prerequisites:** Story 3.1 (reader.store migration) and Story 2.1 (useEpubReader hook) must be complete.

**New `ReaderEngine.tsx` props interface:**
```typescript
interface ReaderEngineProps {
  epubUrl: string
}
```
The old props (`paragraphs`, `coverImageUrl`, `bookTitle`, `onCenterTap`) are all removed.

**New `ReaderEngine.tsx` authoritative implementation:**
```typescript
import { useEffect } from 'react'
import { useEpubReader } from './useEpubReader'
import { useReaderStore } from '@/stores/reader.store'
import { SkeletonText } from '@/shared/components/SkeletonText'
import ReaderErrorPage from './ReaderErrorPage'

interface ReaderEngineProps {
  epubUrl: string
}

export function ReaderEngine({ epubUrl }: ReaderEngineProps) {
  const { containerRef, rendition, isReady, error } = useEpubReader(epubUrl)
  const { toggleChrome } = useReaderStore()

  // Wire navigation and chrome toggle events via epub.js rendition
  useEffect(() => {
    if (!rendition) return

    const handleClick = (event: MouseEvent) => {
      const x = event.clientX
      const width = window.innerWidth
      if (x < width * 0.2) {
        void rendition.prev()
      } else if (x > width * 0.8) {
        void rendition.next()
      } else {
        toggleChrome()
      }
    }

    const handleKeyup = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') void rendition.next()
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') void rendition.prev()
    }

    rendition.on('click', handleClick)
    rendition.on('keyup', handleKeyup)

    return () => {
      rendition.off('click', handleClick)
      rendition.off('keyup', handleKeyup)
    }
  }, [rendition, toggleChrome])

  if (error) {
    return <ReaderErrorPage category="parse" />
  }

  return (
    <div
      role="region"
      aria-label="Nội dung kinh"
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {!isReady && (
        <div className="absolute inset-0 p-6" data-testid="reader-skeleton">
          <SkeletonText lines={14} />
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          visibility: isReady ? 'visible' : 'hidden',
        }}
        data-testid="epub-container"
      />
    </div>
  )
}
```

**CRITICAL: epub.js event delegation pattern:**
- `rendition.on('click', handler)` fires for clicks INSIDE the epub.js iframe — tap events from the iframe are forwarded to the rendition's event bus
- Do NOT use outer div `onClick` for navigation — tap events inside the epub.js iframe do NOT bubble to the outer React DOM
- The `rendition.off(event, handler)` call in cleanup prevents double-firing on re-renders

**CRITICAL: Navigation returns Promises:**
`rendition.next()` and `rendition.prev()` return Promises. Use `void rendition.next()` to avoid unhandled Promise warnings (errors will surface via `rendition.on('loadError')`).

**`ReaderPage.tsx` changes:**
Current: reads `book.content` (paragraphs) from `useBook()` and passes to `ReaderEngine`
New: needs `epubUrl` from the catalog entry for this `bookId`

```typescript
// In ReaderPage.tsx — get epubUrl from catalog
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'

const { data: catalog } = useCatalogIndex()
const catalogBook = catalog?.books.find(b => b.id === bookId)
const epubUrl = catalogBook?.epubUrl ?? null

// ... handle epubUrl being null (show error)

return (
  <ChromelessLayout book={book} hasCoverPage={false}>
    <ReaderEngine epubUrl={epubUrl} />
  </ChromelessLayout>
)
```

Note: `useBook()` can still be used for book metadata (title, coverImageUrl for ChromelessLayout), but `epubUrl` comes from the catalog. Alternatively, if `useBook()` is only used for metadata that ChromelessLayout needs, keep it. If all metadata can come from the catalog entry, `useBook()` can be removed from `ReaderPage`.

**`ChromelessLayout` `hasCoverPage` prop:** The old `ReaderEngine` had a cover page (page 0 = cover image). With epub.js, the EPUB itself contains the cover. Set `hasCoverPage={false}` or remove the prop if the layout conditionals on it — check `ChromelessLayout.tsx` to understand what this prop does.

**Files to DELETE:**
- `src/lib/pagination/paginateBook.ts`
- `src/lib/pagination/paginateBook.test.ts`
- `src/lib/pagination/pagination.types.ts`
- `src/lib/pagination/index.ts`
- `src/features/reader/useDOMPagination.ts`

Check if `src/lib/pagination/index.ts` exists as a barrel export (it does — `paginateBook.ts` likely exports from there). Delete it.

**Imports to clean up:**
After deletion, remove any remaining `import ... from '@/lib/pagination'` or `import useDOMPagination from './useDOMPagination'` in other files. Run `pnpm typecheck` to find them all.

### Project Structure Notes

- Deleted files: `src/lib/pagination/paginateBook.ts`, `paginateBook.test.ts`, `pagination.types.ts`, `index.ts`, `src/features/reader/useDOMPagination.ts`
- Rewritten files: `src/features/reader/ReaderEngine.tsx`, `src/features/reader/ReaderEngine.test.tsx`, `src/features/reader/ReaderPage.tsx`
- The `src/lib/pagination/` directory will be empty after deletions — remove the directory itself

### Testing Standards

- `ReaderEngine.test.tsx` should mock `useEpubReader`:
  ```typescript
  vi.mock('./useEpubReader', () => ({
    useEpubReader: vi.fn(() => ({
      containerRef: { current: null },
      rendition: null,
      book: null,
      isReady: false,
      error: null,
    })),
  }))
  ```
- Test: skeleton rendered when `isReady: false`
- Test: error page rendered when `error: new Error('failed')`
- Test: container div is in DOM when `isReady: true`
- E2E tests for actual page navigation will require epub.js loaded in Playwright (Stories 2.3+ integration)

### References

- Architecture: [Source: architecture-reader-ui-epubjs.md#Frontend Architecture — ReaderEngine component responsibilities]
- Navigation pattern: [Source: architecture-reader-ui-epubjs.md#Communication Patterns — Navigation authoritative pattern]
- Anti-patterns: [Source: architecture-reader-ui-epubjs.md#Communication Patterns — ❌ WRONG outer div overlay]
- Current ReaderEngine: [Source: apps/reader/src/features/reader/ReaderEngine.tsx]
- Current ReaderPage: [Source: apps/reader/src/features/reader/ReaderPage.tsx]
- lib/pagination: [Source: apps/reader/src/lib/pagination/]
- useDOMPagination: [Source: apps/reader/src/features/reader/useDOMPagination.ts]
- Epics AC: [Source: epics-reader-ui-epubjs.md#Story 2.2 Acceptance Criteria]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
