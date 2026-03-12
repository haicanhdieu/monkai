---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
inputDocuments:
  - _bmad-output/planning-artifacts/phase-2-5-epub-js/prd-reader-ui-epubjs.md
  - _bmad-output/planning-artifacts/phase-2-5-epub-js/architecture-reader-ui-epubjs.md
---

# monkai - Epic Breakdown (Reader UI — epub.js)

## Overview

This document provides the complete epic and story breakdown for the **Monkai Reader UI (epub.js)** phase, decomposing the requirements from the PRD and Architecture into implementable stories. This is a **brownfield library swap** within `apps/reader/`: the custom pagination engine is replaced by epub.js. All non-reader features (library, search, settings, PWA shell) are architecturally unchanged.

## Requirements Inventory

### Functional Requirements

FR1: Users can browse the library by categories (e.g. Nikaya, Đại Thừa).
FR2: Users can view a list of sutras within a category.
FR3: Users can search for sutras by title or keywords across the catalog.
FR4: Search results are shown from the cached catalog (offline-capable).
FR5: Users can open a sutra and read its contents (via epub.js when content is EPUB).
FR6: Users navigate forward and backward with discrete page turns (tap/swipe) consistent with paginated UX.
FR7: Pagination/layout is driven by epub.js (viewport/locations); user font size and theme preferences apply to the reader.
FR8: Load/parse errors are handled with clear, calm error states (e.g. ReaderErrorPage).
FR9: Catalog and previously opened books are available offline.
FR10: App shell and catalog (and book assets) are cached on first visit.
FR11: When online, catalog updates can be fetched in the background.
FR12: Reading progress and settings use the abstracted storage layer.
FR13: Users resume from the last saved position when reopening the app or a sutra.
FR14: Users can change font size (applied to epub.js viewer context).
FR15: Users can switch reading themes (Day, Night, Sepia).
FR16: Customization is persisted across sessions.

### NonFunctional Requirements

NFR1: TTI < 2.0 seconds on a 3G-like connection after cache is populated.
NFR2: Page turn visual response < 50ms where feasible (epub.js `rendition.next()`/`prev()` must meet this; locations generation is async and must not block).
NFR3: Book open and first render must not freeze the UI; any locations generation or heavy work must be async/non-blocking.
NFR4: Core reading (browse cached catalog, open cached book, change settings, save progress) works without network for cached content.
NFR5: Graceful handling of storage quota and storage errors — user-facing message, no silent crash.
NFR6: All three themes (Day, Night, Sepia) meet WCAG AA contrast (4.5:1 for text) inside the epub.js iframe context.
NFR7: Layout supports increased text size up to 200% without breaking.
NFR8: Touch targets (tap zones, buttons) are at least 44×44 CSS pixels.
NFR9: Reader and chrome expose appropriate ARIA landmarks and live regions for page/location changes.
NFR10: Lighthouse PWA and Performance scores ≥ 90 where applicable.

### Additional Requirements

**From Architecture (epub.js integration):**

- **EPUB build script:** `apps/reader/scripts/build-epubs.mjs` must be created to convert each `book-data/*.json` into a valid `.epub` file at build time using jszip. Output goes to `public/book-data/`. Script also patches `index.json` to add `epubUrl` fields.
- **Build pipeline step:** `pnpm run build:epubs` added to CI pipeline (after lint/typecheck, before `vite build`). Package.json script: `"build:epubs": "node scripts/build-epubs.mjs"`.
- **Catalog schema update:** Add `epubUrl: z.string().optional()` to `CatalogItem` in `catalog.schema.ts`.
- **reader.store migration:** `currentCfi: string | null` replaces `currentPage: number` and `pages[]`. Zustand actions: `setCurrentCfi(cfi)` replaces `setCurrentPage(n)`. `reset()` and `toggleChrome()` unchanged.
- **LAST_READ_POSITION shape change:** Value shape changes from `{ bookId: string, page: number }` to `{ bookId: string, cfi: string }`.
- **Remove lib/pagination/ entirely:** `paginateBook.ts`, `paginateBook.test.ts`, `pagination.types.ts` all deleted; no DOM measurement logic of any kind.
- **useEpubReader hook:** `features/reader/useEpubReader.ts` is the single import point for `epubjs`. Returns `{ containerRef, rendition, book, isReady, error }`. Creates `ePub(epubUrl)` + `book.renderTo(containerRef, { flow: 'paginated' })`; calls `book.destroy()` on unmount.
- **epubThemes.ts constants:** `features/reader/epubThemes.ts` defines `EPUB_THEMES` for Day/Sepia/Dark with body + paragraph CSS properties matching Monkai design tokens (Lora font, correct background/foreground per theme).
- **ReaderEngine rewrite:** Renders container `<div ref={containerRef}>`; consumes `useEpubReader`; wires `rendition.on('relocated')` for progress save, `rendition.on('click')` for tap-zone navigation + chrome toggle, `rendition.on('keyup')` for keyboard nav. Does NOT manage Book/Rendition lifecycle directly.
- **ReaderPage update:** Reads `epubUrl` from catalog item; passes it to `ReaderEngine`; handles `savedCfi` resume via `rendition.display(savedCfi)`.
- **useStorageHydration update:** Reads `cfi` from `LAST_READ_POSITION` storage; calls `readerStore.setCurrentCfi(cfi)`.
- **Workbox epub-cache route:** Add `CacheFirst` runtime cache for `/book-data/*.epub` in `vite.config.ts`; 30-day expiry, max 20 entries.
- **ESLint enforcement:** Add `epubjs` to `no-restricted-imports` in `.eslintrc.cjs` with message "Import epub.js only via useEpubReader hook".
- **New dependencies:** `epubjs` (runtime); `jszip` dev dep for `build-epubs.mjs` (may already be transitive via epub.js).

**From UX (inherited from phase-2 base — no separate UX doc in this phase):**

- Chromeless reader layout: center-tap toggles chrome; left/right 20% zones for page navigation.
- Tap/swipe for mobile navigation; keyboard arrow keys / Page Up/Down for desktop.
- Sepia / Light / Dark themes; persistent font size preference.
- Loading skeleton while epub.js is rendering; calm error state on parse/load failure.
- No change to library, search, settings, bookmark, or navigation chrome UX.

### FR Coverage Map

```
FR1:  Pre-existing — library browse, unchanged
FR2:  Pre-existing — sutra listing, unchanged
FR3:  Pre-existing — global search, unchanged
FR4:  Pre-existing — offline search, unchanged
FR5:  Epic 1 (content loading) + Epic 2 (rendering/reading)
FR6:  Epic 2 — page-flip navigation via rendition events
FR7:  Epic 2 (epub.js layout) + Epic 3 (theme/font applied to iframe)
FR8:  Epic 2 — error states from useEpubReader hook
FR9:  Epic 1 — EPUB assets cached by Service Worker
FR10: Epic 1 — epub-cache Workbox route (extension of existing SW)
FR11: Pre-existing — background catalog update, unchanged
FR12: Epic 3 — progress and settings via StorageService
FR13: Epic 3 — resume from CFI via rendition.display(savedCfi)
FR14: Epic 3 — font size via rendition.themes.fontSize()
FR15: Epic 3 — theme via rendition.themes.select()
FR16: Epic 3 — preferences persisted in settings.store + StorageService
```

## Epic List

### Epic 1: EPUB Content Pipeline
All sutras exist as EPUB files, the catalog references their URLs, and the Service Worker caches them. Users can launch any sutra and have its content ready to load into epub.js.
**FRs covered:** FR5 (content loading foundation), FR9, FR10

### Epic 2: epub.js Reader Experience
Users can read sutras with fluid paginated page-flip navigation powered by epub.js. Tap/swipe left/right and keyboard arrows navigate pages. Center-tap shows/hides the chrome. Error and loading states are handled gracefully.
**FRs covered:** FR5, FR6, FR7, FR8

### Epic 3: Reading Preferences & Progress
Users customize their experience (Sepia/Light/Dark theme, font size) with changes taking effect inside the epub.js iframe. Reading position is saved as a CFI string and automatically restored when they reopen a sutra.
**FRs covered:** FR12, FR13, FR14, FR15, FR16

---

## Epic 1: EPUB Content Pipeline

All sutras exist as EPUB files, the catalog references their URLs, and the Service Worker caches them. Users can launch any sutra and have its content ready to load into epub.js.

### Story 1.1: EPUB Build Script and Catalog Patching

As a content maintainer,
I want each sutra's JSON file automatically converted to a valid EPUB at build time,
So that epub.js can load any sutra without runtime conversion.

**Acceptance Criteria:**

**Given** a `book-data/*.json` file exists (with title and paragraphs array per Phase 1 schema)
**When** `pnpm run build:epubs` is executed
**Then** a valid `.epub` file is written to `public/book-data/` mirroring the JSON path structure
**And** each generated EPUB contains: `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/content.xhtml` (title + paragraphs rendered as HTML), `OEBPS/toc.ncx`

**Given** `build-epubs.mjs` has run
**When** the script completes
**Then** `public/book-data/index.json` is patched with an `epubUrl` field on each catalog entry (e.g. `"/book-data/vbeta/some-sutra.epub"`)
**And** entries without a corresponding JSON source are left unchanged

**Given** the `build:epubs` npm script is defined in `apps/reader/package.json`
**When** the CI pipeline runs
**Then** `pnpm run build:epubs` executes successfully before `vite build`
**And** build failures (invalid JSON, write errors) cause the script to exit non-zero

### Story 1.2: Catalog Zod Schema Update

As a developer,
I want the catalog item Zod schema to include an optional `epubUrl` field,
So that TypeScript enforces the correct shape when the build script patches `index.json` and when the reader reads EPUB URLs.

**Acceptance Criteria:**

**Given** `src/shared/schemas/catalog.schema.ts` is updated
**When** the TypeScript compiler runs
**Then** `CatalogItem` includes `epubUrl: z.string().optional()` and the inferred type exposes `epubUrl?: string`
**And** existing catalog items without `epubUrl` continue to parse without errors (field is optional)

**Given** a catalog item with `epubUrl` set
**When** `DataService` fetches the catalog and `useCatalogIndex` returns results
**Then** `epubUrl` is accessible on each `CatalogItem` object in the returned data
**And** no existing catalog-consuming components (LibrarySearchHub, CategoryPage) require changes

### Story 1.3: Service Worker EPUB Caching

As a reader user,
I want EPUBs I have opened to be available offline,
So that I can read previously accessed sutras without internet connectivity.

**Acceptance Criteria:**

**Given** `vite.config.ts` is updated with a `CacheFirst` Workbox runtime route for `/book-data/*.epub`
**When** a user opens a sutra for the first time while online
**Then** the EPUB binary asset is fetched from the network and stored in the `epub-cache` (max 20 entries, 30-day expiry)

**Given** the EPUB is in `epub-cache`
**When** the user opens the same sutra while offline
**Then** the EPUB is served from the cache with no network request

**Given** the Lighthouse PWA audit is run
**When** the app shell and at least one EPUB are cached
**Then** the PWA score remains ≥ 90 and the offline check passes for cached content

---

## Epic 2: epub.js Reader Experience

Users can read sutras with fluid paginated page-flip navigation powered by epub.js. Tap/swipe left/right and keyboard arrows navigate pages. Center-tap shows/hides chrome. Error and loading states are handled gracefully.

### Story 2.1: Add epub.js Dependency and useEpubReader Hook

As a developer,
I want a dedicated `useEpubReader` hook that owns the entire epub.js lifecycle,
So that no other component needs to import or manage `Book`/`Rendition` objects directly.

**Acceptance Criteria:**

**Given** `epubjs` is added to `apps/reader` dependencies and `jszip` added as a dev dependency
**When** `pnpm install` runs
**Then** both packages resolve without version conflicts and the app builds successfully

**Given** `features/reader/useEpubReader.ts` is implemented
**When** called with a valid `epubUrl: string`
**Then** it returns `{ containerRef, rendition, book, isReady, error }` where `containerRef` is attached to the container div that epub.js renders into
**And** `book.renderTo(containerRef.current, { flow: 'paginated', width: '100%', height: '100%' })` is called once on mount
**And** `isReady` becomes `true` after the rendition ready event fires

**Given** the component consuming `useEpubReader` unmounts or `epubUrl` changes
**When** the `useEffect` cleanup runs
**Then** `book.destroy()` is called exactly once, releasing all epub.js resources

**Given** `.eslintrc.cjs` is updated with a `no-restricted-imports` rule for `epubjs`
**When** any file other than `useEpubReader.ts` attempts to import from `epubjs`
**Then** ESLint reports an error: "Import epub.js only via useEpubReader hook"

### Story 2.2: ReaderEngine Rewrite and Page Navigation

As a reader user,
I want to navigate through a sutra's pages by tapping left/right zones or using keyboard arrows,
So that reading feels natural and fluid on both mobile and desktop.

**Acceptance Criteria:**

**Given** `ReaderEngine.tsx` is rewritten to consume `useEpubReader(epubUrl)`
**When** the component mounts
**Then** a `<div ref={containerRef}>` fills the available reader area and epub.js renders EPUB content into it
**And** `lib/pagination/` (`paginateBook.ts`, `paginateBook.test.ts`, `pagination.types.ts`) no longer exist in the codebase

**Given** the epub.js rendition is ready
**When** the user taps in the left 20% of the screen
**Then** `rendition.prev()` is called via `rendition.on('click')` zone detection
**And** the page visually advances to the previous page

**Given** the epub.js rendition is ready
**When** the user taps in the right 80%–100% zone
**Then** `rendition.next()` is called and the page advances to the next page

**Given** the reader is focused on desktop
**When** the user presses ArrowRight or PageDown
**Then** `rendition.next()` is called via `rendition.on('keyup')`

**When** the user presses ArrowLeft or PageUp
**Then** `rendition.prev()` is called

**Given** the user taps in the center zone (20%–80%)
**When** the tap event fires
**Then** `readerStore.toggleChrome()` is called, toggling the chrome visibility

**Given** `ReaderPage.tsx` is updated
**When** a sutra is opened
**Then** `epubUrl` is read from the validated `CatalogItem` and passed to `ReaderEngine`
**And** `ReaderEngine` never constructs the EPUB URL itself

### Story 2.3: Reader Loading and Error States

As a reader user,
I want to see a loading indicator while a book is opening and a clear message if it fails,
So that I always know what the reader is doing.

**Acceptance Criteria:**

**Given** `useEpubReader` returns `isReady: false` and `error: null`
**When** `ReaderEngine` renders
**Then** a `<SkeletonText>` loading indicator is displayed in place of the reader content
**And** the epub.js container div is mounted but visually hidden until `isReady` is true

**Given** epub.js fires `book.on('openFailed', ...)` or `rendition.on('loadError', ...)`
**When** the error event is received in `useEpubReader`
**Then** `error` is set to the received error object
**And** `ReaderErrorPage` is rendered with a calm, informative message (no raw error object exposed to the user)

**Given** a book loads successfully
**When** `isReady` becomes `true`
**Then** the skeleton is removed and the epub.js content is visible
**And** no `try/catch` is wrapped around the `ePub()` constructor (errors are event-driven)

**Given** the reader area renders
**When** a screen reader navigates the page
**Then** the reader region has an appropriate ARIA landmark and a live region announces page/location changes on navigation

---

## Epic 3: Reading Preferences & Progress

Users customize their experience (Sepia/Light/Dark theme, font size) with changes taking effect inside the epub.js iframe. Reading position is saved as a CFI string and automatically restored when they reopen a sutra.

### Story 3.1: reader.store Migration to CFI-Based Progress

As a developer,
I want `reader.store` to track reading position as a CFI string instead of a page number,
So that the store's shape matches epub.js's location model and TypeScript enforces the migration everywhere.

**Acceptance Criteria:**

**Given** `reader.store.ts` is updated
**When** the TypeScript compiler runs
**Then** the store interface is exactly:
```typescript
interface ReaderState {
  currentCfi: string | null
  isChromeVisible: boolean
  setCurrentCfi: (cfi: string) => void
  toggleChrome: () => void
  reset: () => void
}
```
**And** `currentPage`, `setCurrentPage`, and `pages[]` no longer exist — any remaining references are compile errors

**Given** `storage.keys.ts` documents the `LAST_READ_POSITION` value shape
**When** a value is written or read
**Then** the shape is `{ bookId: string, cfi: string }` — never `{ bookId: string, page: number }`

**Given** `useStorageHydration.ts` is updated
**When** the app initialises and a saved `LAST_READ_POSITION` is found in storage
**Then** `readerStore.setCurrentCfi(savedCfi)` is called with the stored CFI value
**And** items with the old `page` shape are gracefully ignored (no crash on stale data)

### Story 3.2: Progress Persistence and Resume from Last Position

As a reader user,
I want my exact reading position saved every time I turn a page,
So that when I reopen a sutra I resume exactly where I left off.

**Acceptance Criteria:**

**Given** `rendition.on('relocated', ...)` is wired in `ReaderEngine`
**When** the user turns a page and epub.js fires the `relocated` event
**Then** `readerStore.setCurrentCfi(location.start.cfi)` is called
**And** `storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId, cfi: location.start.cfi })` is called in the same handler
**And** progress is NOT saved in a `useEffect` watching `currentCfi`

**Given** a user previously read a sutra and a CFI was saved
**When** the user reopens that sutra
**Then** `rendition.display(savedCfi)` is called after `isReady` is true
**And** the reader opens at the saved page, not the beginning

**Given** no saved CFI exists for a sutra
**When** the user opens it
**Then** `rendition.display()` is called without arguments (epub.js default: beginning of book)

**Given** the app is offline
**When** the user opens a cached sutra
**Then** progress save and resume work identically using the locally stored CFI

### Story 3.3: Themes and Font Size Inside epub.js

As a reader user,
I want my chosen theme (Day/Sepia/Dark) and font size to apply inside the reader,
So that my reading preferences take effect in the epub.js content, not just the app chrome.

**Acceptance Criteria:**

**Given** `features/reader/epubThemes.ts` is created with `EPUB_THEMES` constants
**When** the file is reviewed
**Then** it defines CSS property objects for `theme-light`, `theme-sepia`, and `theme-dark` covering at minimum `body` (background, color, fontFamily: Lora) and `p` (lineHeight, margin)
**And** all three themes meet WCAG AA contrast (≥ 4.5:1) for body text

**Given** the epub.js rendition is ready
**When** `useEpubReader` initialises
**Then** all three themes are registered via `rendition.themes.register(name, styles)` for each entry in `EPUB_THEMES`
**And** the current theme from `settings.store` is applied via `rendition.themes.select(currentTheme)`

**Given** the user changes their theme in Settings
**When** `settings.store.setTheme(newTheme)` is called
**Then** `rendition.themes.select(newTheme)` is called in response (via a `useEffect` watching the theme value)
**And** the rendered EPUB content visually updates to the new theme without a page reload

**Given** the user changes their font size in Settings
**When** `settings.store.setFontSize(newSize)` is called
**Then** `rendition.themes.fontSize(`${newSize}px`)` is called
**And** font size is NOT applied via CSS on the outer container div

**Given** the user sets font size to 200% of the base size
**When** the reader renders
**Then** text remains readable and layout does not overflow or break

**Given** the app is restarted
**When** the reader opens
**Then** the previously saved theme and font size are read from `settings.store` (hydrated via `useStorageHydration`) and applied to epub.js on rendition ready

