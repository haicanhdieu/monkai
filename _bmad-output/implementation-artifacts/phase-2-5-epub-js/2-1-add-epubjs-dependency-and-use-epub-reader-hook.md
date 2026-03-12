# Story 2.1: Add epub.js Dependency and useEpubReader Hook

Status: ready-for-dev

## Story

As a developer,
I want a dedicated `useEpubReader` hook that owns the entire epub.js lifecycle,
so that no other component needs to import or manage `Book`/`Rendition` objects directly.

## Acceptance Criteria

1. **Given** `epubjs` is added to `apps/reader` dependencies and `jszip` (if not already present) added as a dev dependency
   **When** `pnpm install` runs
   **Then** both packages resolve without version conflicts and the app builds successfully

2. **Given** `features/reader/useEpubReader.ts` is implemented
   **When** called with a valid `epubUrl: string`
   **Then** it returns `{ containerRef, rendition, book, isReady, error }` where `containerRef` is attached to the container div that epub.js renders into
   **And** `book.renderTo(containerRef.current, { flow: 'paginated', width: '100%', height: '100%' })` is called once on mount
   **And** `isReady` becomes `true` after the rendition ready event fires

3. **Given** the component consuming `useEpubReader` unmounts or `epubUrl` changes
   **When** the `useEffect` cleanup runs
   **Then** `book.destroy()` is called exactly once, releasing all epub.js resources

4. **Given** `eslint.config.js` is updated with a `no-restricted-imports` rule for `epubjs`
   **When** any file other than `useEpubReader.ts` attempts to import from `epubjs`
   **Then** ESLint reports an error: "Import epub.js only via useEpubReader hook"

## Tasks / Subtasks

- [ ] Add `epubjs` runtime dependency to `apps/reader` (AC: 1)
  - [ ] `cd apps/reader && pnpm add epubjs`
  - [ ] Verify version: `npm info epubjs version` — pin the installed version in `package.json`
- [ ] Create `src/features/reader/useEpubReader.ts` (AC: 2, 3)
  - [ ] Import: `import ePub from 'epubjs'` and types `Book`, `Rendition` from `epubjs`
  - [ ] Accept `epubUrl: string | null` parameter
  - [ ] Create `containerRef: React.RefObject<HTMLDivElement>` via `useRef`
  - [ ] State: `isReady: boolean` (initial `false`), `error: Error | null` (initial `null`), `rendition: Rendition | null`, `book: Book | null`
  - [ ] `useEffect([epubUrl])`: create Book, call `book.renderTo()`, listen for ready/error events, return cleanup `book.destroy()`
  - [ ] Return `{ containerRef, rendition, book, isReady, error }`
- [ ] Add `epubjs` to `no-restricted-imports` in `apps/reader/eslint.config.js` (AC: 4)
  - [ ] Add to the existing `patterns` array in `no-restricted-imports`
  - [ ] Message: `"Import epub.js only via useEpubReader hook"`
  - [ ] Add exception for `src/features/reader/useEpubReader.ts` itself using `allowImportNames` or a separate overrides block

## Dev Notes

### Codebase Context

**Prerequisite:** Story 3.1 (reader.store migration) must be done first so `readerStore.setCurrentCfi` exists. However, `useEpubReader` itself does NOT call `setCurrentCfi` — that's done by `ReaderEngine` in Story 2.2 via `rendition.on('relocated')`. The hook just exposes `rendition` for the consumer to wire events.

**epub.js import:** epub.js uses a default export. The correct import is:
```typescript
import ePub from 'epubjs'
import type { Book, Rendition, Location } from 'epubjs'
```
If types are bundled: `import ePub, { type Book, type Rendition } from 'epubjs'`
If `@types/epubjs` is separate: install `pnpm add -D @types/epubjs`.
Check what's available after `pnpm add epubjs`.

**The authoritative `useEpubReader` implementation:**
```typescript
// src/features/reader/useEpubReader.ts
import { useEffect, useRef, useState } from 'react'
import ePub from 'epubjs'
import type { Book, Rendition } from 'epubjs'

export interface UseEpubReaderResult {
  containerRef: React.RefObject<HTMLDivElement>
  rendition: Rendition | null
  book: Book | null
  isReady: boolean
  error: Error | null
}

export function useEpubReader(epubUrl: string | null): UseEpubReaderResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rendition, setRendition] = useState<Rendition | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!epubUrl || !containerRef.current) return

    setIsReady(false)
    setError(null)

    const bookInstance = ePub(epubUrl)

    bookInstance.on('openFailed', (err: Error) => {
      setError(err)
    })

    const renditionInstance = bookInstance.renderTo(containerRef.current, {
      flow: 'paginated',
      width: '100%',
      height: '100%',
    })

    renditionInstance.on('ready', () => {
      setIsReady(true)
    })

    renditionInstance.on('loadError', (err: Error) => {
      setError(err)
    })

    setBook(bookInstance)
    setRendition(renditionInstance)

    return () => {
      bookInstance.destroy()
      setBook(null)
      setRendition(null)
      setIsReady(false)
      setError(null)
    }
  }, [epubUrl])

  return { containerRef, rendition, book, isReady, error }
}
```

**Note on `containerRef.current`:** The `useEffect` runs after mount, so `containerRef.current` will be the DOM element if the parent component has rendered the `<div ref={containerRef}>` before effect runs. If using React Strict Mode (double invocation in dev), the cleanup + re-create will call `book.destroy()` then re-instantiate — this is correct behavior.

**Note on `ready` vs `rendered` events:** epub.js `Rendition` fires `'rendered'` per-section and `'started'` or `'ready'` for initial display. Check epub.js documentation for your installed version. The event to use for "book is visible and ready to interact with" may be `'rendered'` for the first section. If `'ready'` doesn't fire, try `renditionInstance.display().then(() => setIsReady(true))`.

**ESLint config update — `apps/reader/eslint.config.js`:**
The file uses flat config format. Add to the `no-restricted-imports` patterns array:
```javascript
{
  group: ['epubjs'],
  message: 'Import epub.js only via useEpubReader hook (features/reader/useEpubReader.ts).'
}
```
To exempt `useEpubReader.ts` itself, add an overrides entry:
```javascript
{
  files: ['src/features/reader/useEpubReader.ts'],
  rules: {
    'no-restricted-imports': 'off',
  },
}
```

**Current `no-restricted-imports` in eslint.config.js:**
```javascript
'no-restricted-imports': [
  'error',
  {
    patterns: [{ group: ['localforage'], message: 'Import StorageService from @/shared/services/storage.service instead.' }]
  }
]
```
Add the `epubjs` pattern to the `patterns` array. The `overrides` block for `useEpubReader.ts` must be a separate config object in the `tseslint.config(...)` array.

### epub.js Version Note

As of early 2026, epub.js is at v0.3.x. Pin the exact version. Key behaviors of v0.3.x:
- `ePub(url)` returns a `Book`; synchronous, does not throw
- `book.renderTo(element, options)` returns a `Rendition`
- Errors fire asynchronously via `book.on('openFailed')` — not via try/catch around `ePub()`
- `rendition.on('relocated', (location) => ...)` fires after each page turn with location info
- `book.destroy()` cleans up iframes, event listeners, and memory

### Project Structure Notes

- New file: `src/features/reader/useEpubReader.ts`
- Modified files: `apps/reader/package.json` (new dep), `apps/reader/eslint.config.js` (new rule)
- The hook lives in `features/reader/` alongside `ReaderEngine.tsx`, following feature-based directory convention

### Testing Standards

- Unit tests for `useEpubReader` are difficult due to epub.js requiring a real DOM. Skip unit tests for the hook itself in this story.
- Integration via `ReaderEngine.test.tsx` will be done in Story 2.2
- Verify ESLint rule works: create a test import of `epubjs` in a scratch file and confirm ESLint reports the error; then delete the scratch file

### References

- Architecture decision: [Source: architecture-reader-ui-epubjs.md#API & Communication Patterns — epub.js lifecycle]
- Hook signature: [Source: architecture-reader-ui-epubjs.md#API & Communication Patterns]
- ESLint enforcement: [Source: architecture-reader-ui-epubjs.md#Enforcement Guidelines]
- Current eslint config: [Source: apps/reader/eslint.config.js]
- Epics AC: [Source: epics-reader-ui-epubjs.md#Story 2.1 Acceptance Criteria]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
