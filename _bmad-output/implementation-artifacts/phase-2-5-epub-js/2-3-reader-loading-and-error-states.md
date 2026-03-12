# Story 2.3: Reader Loading and Error States

Status: ready-for-dev

## Story

As a reader user,
I want to see a loading indicator while a book is opening and a clear message if it fails,
so that I always know what the reader is doing.

## Acceptance Criteria

1. **Given** `useEpubReader` returns `isReady: false` and `error: null`
   **When** `ReaderEngine` renders
   **Then** a `<SkeletonText>` loading indicator is displayed in place of the reader content
   **And** the epub.js container div is mounted but visually hidden until `isReady` is true

2. **Given** epub.js fires `book.on('openFailed', ...)` or `rendition.on('loadError', ...)`
   **When** the error event is received in `useEpubReader`
   **Then** `error` is set to the received error object
   **And** `ReaderErrorPage` is rendered by `ReaderEngine` with a calm, informative message (no raw error stack exposed to the user)

3. **Given** a book loads successfully
   **When** `isReady` becomes `true`
   **Then** the skeleton is removed and the epub.js content is visible
   **And** no `try/catch` is wrapped around the `ePub()` constructor (errors are event-driven)

4. **Given** the reader area renders
   **When** a screen reader navigates the page
   **Then** the reader region has an appropriate ARIA landmark (`role="region"`, `aria-label="Nội dung kinh"`)
   **And** a live region (`aria-live="polite"`) announces page/location changes on navigation

## Tasks / Subtasks

- [ ] Verify `ReaderEngine.tsx` from Story 2.2 already has skeleton + error states (Stories 2.2 and 2.3 are closely related) (AC: 1, 2, 3)
  - [ ] Confirm `<SkeletonText lines={14} />` renders when `!isReady && !error`
  - [ ] Confirm `<ReaderErrorPage category="parse" />` (or `category="unknown"`) renders when `error !== null`
  - [ ] Confirm no try/catch around `ePub()` in `useEpubReader.ts`
- [ ] Verify epub container div is mounted-but-hidden during load, not unmounted (AC: 1)
  - [ ] Use `visibility: hidden` (not `display: none`) to keep the epub.js DOM target in the document
- [ ] Add ARIA live region to `ReaderEngine.tsx` for location change announcements (AC: 4)
  - [ ] Add `aria-live="polite"` region that announces page changes when `rendition.on('relocated')` fires
  - [ ] Update `aria-label` on the container region
- [ ] Verify `ReaderErrorPage` is used correctly (AC: 2)
  - [ ] Check `ReaderErrorPage.tsx` prop signature — it accepts `category: DataErrorCategory`
  - [ ] Use `category="parse"` for EPUB load/parse failures from epub.js
  - [ ] Check `ReaderErrorPage.tsx` for `isOffline` prop — pass if relevant
- [ ] Update `ReaderEngine.test.tsx` to cover loading and error states (AC: 1, 2, 3, 4)
  - [ ] Test: skeleton shown when `isReady: false, error: null`
  - [ ] Test: error page shown when `error` is an Error instance
  - [ ] Test: skeleton hidden and content visible when `isReady: true`
  - [ ] Test: ARIA region present in all states

## Dev Notes

### Codebase Context

**This story builds directly on Story 2.2's `ReaderEngine` rewrite.** Most of the loading/error state logic should already be in place from Story 2.2. This story focuses on polish: verifying correctness, adding the ARIA live region, and ensuring the error message is user-friendly.

**`ReaderErrorPage.tsx` current interface:**
```typescript
// src/features/reader/ReaderErrorPage.tsx
export default function ReaderErrorPage({
  category,
  isOffline,
}: {
  category: DataErrorCategory
  isOffline?: boolean
})
```
`DataErrorCategory` values: `'network' | 'parse' | 'not_found' | 'unknown'`

For epub.js failures (`openFailed`, `loadError`): use `category="parse"`.

**epub.js error event patterns:**
```typescript
// In useEpubReader.ts — these must already be implemented from Story 2.1
book.on('openFailed', (err: Error) => setError(err))
rendition.on('loadError', (err: Error) => setError(err))
// NOT: try { const book = ePub(url) } catch (e) { ... }  ← ePub() is synchronous and doesn't throw
```

**ARIA live region for location changes:**
Add a visually-hidden but screen-reader-visible element that updates when the page changes:
```tsx
// Add to ReaderEngine.tsx — tracks current location for screen readers
const [locationAnnouncement, setLocationAnnouncement] = useState('')

// In the useEffect that wires rendition events (Story 3.2 will also add relocated handler):
rendition.on('relocated', (location: Location) => {
  setLocationAnnouncement(`Page ${location.start.percentage ? Math.round(location.start.percentage * 100) : ''}%`)
})

// In JSX:
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {locationAnnouncement}
</div>
```

Note: The `relocated` handler wiring for progress save is Story 3.2. This story only needs the live region announcement part. It's fine to wire a partial `relocated` handler here (for announcements) and extend it in Story 3.2 (for progress save).

**Skeleton-hidden pattern (CRITICAL — do NOT use `display: none`):**
epub.js renders into a DOM element via an iframe. If the element is removed from the DOM (`display: none`), epub.js may lose its rendering context. Always use `visibility: hidden` to keep the element in the layout:
```tsx
<div
  ref={containerRef}
  style={{
    width: '100%',
    height: '100%',
    visibility: isReady ? 'visible' : 'hidden',
    // DO NOT use: display: none
  }}
/>
```

**`sr-only` utility class:** Tailwind has `sr-only` which applies:
```css
position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;
```

### Project Structure Notes

- Modified files: `src/features/reader/ReaderEngine.tsx`, `src/features/reader/ReaderEngine.test.tsx`
- Possibly also `src/features/reader/useEpubReader.ts` if the `relocated` announcement needs hook changes
- No new files

### Testing Standards

Full test coverage for loading and error states:
```typescript
// ReaderEngine.test.tsx coverage targets:
describe('loading state', () => {
  it('shows skeleton when isReady is false and no error')
  it('keeps epub container mounted during loading (not null ref)')
  it('hides epub container visually during loading')
})
describe('error state', () => {
  it('shows ReaderErrorPage when error is set')
  it('does not show skeleton when error is set')
})
describe('ready state', () => {
  it('shows epub container and hides skeleton when isReady is true')
})
describe('accessibility', () => {
  it('has role=region with correct aria-label')
  it('has aria-live region')
})
```

### References

- Architecture: [Source: architecture-reader-ui-epubjs.md#Process Patterns — epub.js loading states]
- Error handling: [Source: architecture-reader-ui-epubjs.md#Process Patterns — epub.js error handling]
- ARIA: [Source: epics-reader-ui-epubjs.md#Story 2.3 Acceptance Criteria AC4]
- ReaderErrorPage: [Source: apps/reader/src/features/reader/ReaderErrorPage.tsx]
- Epics AC: [Source: epics-reader-ui-epubjs.md#Story 2.3 Acceptance Criteria]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
