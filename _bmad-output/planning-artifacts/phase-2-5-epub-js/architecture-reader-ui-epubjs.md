---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-03-11'
inputDocuments:
  - _bmad-output/planning-artifacts/phase-2-5-epub-js/prd-reader-ui-epubjs.md
  - _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md
  - _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md
  - _bmad-output/project-context.md
workflowType: 'architecture'
project_name: 'monkai'
user_name: 'Minh'
date: '2026-03-11'
---

# Architecture Decision Document — Reader UI (epub.js)

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
12 FRs across four domains — identical to the base Reader UI PRD, interpreted through epub.js:
- **Content Discovery (FR1–FR4):** Browse by category, list sutras, global search, offline-capable search. No architectural change from base — catalog, `DataService`, TanStack Query, MiniSearch remain untouched.
- **Reading Experience (FR5–FR8):** Open and read a sutra via epub.js; paginated page-flip navigation (tap/swipe/keyboard); epub.js drives layout and pagination; load/parse errors handled via `ReaderErrorPage`. The `ReaderEngine` component is substantially rewritten; `lib/pagination/` is removed.
- **Offline & Storage (FR9–FR13):** Catalog and previously opened books available offline; app shell and catalog cached on first visit; background catalog updates; progress and settings via `StorageService`; resume from last saved position. EPUB assets must be added to the Service Worker cache strategy.
- **Reader Customization (FR14–FR16):** Font size and theme (Day/Night/Sepia) applied to epub.js viewer context; persisted across sessions. Theming requires CSS injection into epub.js's iframe.

**Non-Functional Requirements:**
- TTI < 2.0s after cache populated (unchanged)
- Page turn visual response < 50ms (epub.js `rendition.next()`/`prev()` must meet this; locations generation is async and must not block)
- epub.js locations generation or heavy work must be async/non-blocking
- WCAG AA contrast across all three themes (must be validated inside iframe context)
- Touch targets ≥ 44×44px; dynamic text scaling up to 200%
- Offline: core reading works without network for cached content

**Scale & Complexity:**

- Primary domain: PWA / Static Frontend (React 18 + Vite)
- Complexity level: Medium (brownfield library swap; scope well-bounded; iframe integration has non-trivial edge cases)
- Estimated new/changed architectural components: ~5 (ReaderEngine rewrite, epub.js service/hook, EPUB content strategy, CFI progress persistence, SW cache update)
- Unchanged components: ~13 (entire library, search, settings, bookmarks, storage, PWA shell, routing, Zustand stores for settings/bookmarks, TanStack Query, DataService, Zod schemas for catalog)

### Technical Constraints & Dependencies

- **Brownfield base:** All existing Phase 2 architecture decisions (monorepo, Vite, React 18, Zustand, TanStack Query, StorageService, Zod, Workbox, Tailwind v3, feature-based directory, naming conventions) are inherited and must not be changed.
- **epub.js iframe model:** epub.js renders EPUB content into an iframe it manages. CSS custom properties and Tailwind classes on `<html>` do not propagate into the iframe — theming requires explicit injection via epub.js's `rendition.themes` API or `rendition.getContents()`.
- **EPUB content format required:** epub.js requires EPUB files (or ArrayBuffer). The existing catalog and `DataService` serve JSON. An architectural decision is required: convert JSON→EPUB at build time, serve dual format, or generate EPUB on-the-fly in the browser.
- **CFI/location-based progress:** epub.js uses CFI strings or location keys (not integer page indices) for position. The `reader.store` `currentPage: number` shape and the `LAST_READ_POSITION` storage key schema must be updated.
- **Static hosting constraint:** No server-side conversion. Any JSON→EPUB conversion must happen at build time (crawler pipeline or a build script) or in the browser.
- **Hybrid-ready:** epub.js runs in a WebView context (Capacitor) — no constraint added, but iframe event handling must not assume browser-only APIs.

### Cross-Cutting Concerns Identified

1. **iframe theming injection** — Sepia/Light/Dark CSS custom properties must be injected into epub.js's iframe on theme change and on initial render. Affects `ReaderEngine`, `useTheme`, and settings store.
2. **EPUB content format strategy** — Where and how existing JSON sutras become EPUB files. Affects `DataService`, catalog schema, Service Worker cache, and the crawler pipeline.
3. **CFI-based progress persistence** — epub.js location (CFI string or location key) replaces `currentPage: number`. Affects `reader.store`, `StorageService` key schema, and resume-on-open logic.
4. **Service Worker EPUB caching** — EPUB files are binary zip archives; Workbox cache strategy for EPUB assets (and potentially extracted chapter HTML/images) needs explicit configuration.
5. **epub.js lifecycle management** — `Book` and `Rendition` objects must be created, configured, and destroyed correctly across React component mount/unmount and route changes. Memory leaks are a real risk.
6. **Touch/keyboard event delegation** — Tap zones and swipe gestures fire inside the epub.js iframe. Event listeners must be attached to the iframe's `contentDocument` or via epub.js's `rendition.on('click'/'keyup')` API, not to the outer React DOM.

## Starter Template Evaluation

### Primary Technology Domain

PWA / Static Frontend — brownfield. The `apps/reader/` application already exists, scaffolded from `@vite-pwa/create-pwa` (react-ts) as documented in `architecture-reader-ui.md`. No new scaffold is required.

### Starter Options Considered

N/A — brownfield library swap. The only new dependency being introduced is **epub.js**.

### Selected Starter: No new scaffold — existing `apps/reader/` app

**Rationale:**
This is a targeted library swap within an existing, running application. All scaffolding, tooling, and base architecture decisions from Phase 2 are inherited. The architectural work in this document focuses exclusively on how epub.js integrates into the existing structure.

**New Dependency: epub.js**

```bash
# Add to apps/reader
pnpm add epubjs
pnpm add -D @types/epubjs  # if available; otherwise use bundled types
```

**epub.js version note:** Verify the current stable version at install time (`npm info epubjs version`). As of early 2026, the main branch is v0.3.x. Pin the exact version in `package.json` to avoid breaking changes.

**Architectural Decisions Provided by epub.js:**

- **Rendering model:** epub.js renders into an iframe it manages; React does not control the iframe's DOM.
- **Pagination model:** epub.js `Rendition` with `flow: "paginated"` handles layout and page boundaries; `book.locations.generate()` provides CFI-based location keys for progress.
- **Navigation API:** `rendition.next()`, `rendition.prev()`, `rendition.display(cfi)` replace the custom `setCurrentPage(n)` pattern.
- **Event model:** `rendition.on('relocated', ...)`, `rendition.on('click', ...)`, `rendition.on('keyup', ...)` are the integration points for progress save and tap/keyboard navigation.
- **Theming API:** `rendition.themes.register()` / `rendition.themes.select()` and `rendition.getContents()` for CSS injection into the iframe.

**Note:** No new project initialization story is needed. epub.js is added as a dependency in the existing reader implementation stories.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- EPUB content format strategy: build-time JSON→EPUB conversion
- epub.js lifecycle management: `useEpubReader` custom hook
- CFI-based progress persistence: `currentCfi: string | null` replaces `currentPage: number`
- Theming in iframe: `rendition.themes` API + `epubThemes.ts` constants

**Important Decisions (Shape Architecture):**
- Service Worker EPUB caching: dedicated `CacheFirst` runtime cache for `*.epub` assets
- Touch/keyboard event delegation: `rendition.on('click'/'keyup')` with zone detection

**Deferred Decisions (Post-MVP):**
- Web Worker for in-browser EPUB generation (only relevant if Option B format strategy is revisited)
- Explicit "download for offline" user action (vs. automatic cache-on-open)
- epub.js locations pre-generation for page count display (async, can be added post-MVP)

### Data Architecture

**EPUB Content Format Strategy: Build-time JSON→EPUB conversion**

A build script (`apps/reader/scripts/build-epubs.mjs`) converts each `book-data/*.json` into a valid `.epub` file at build time. The catalog `index.json` gets an `epubUrl` field (e.g. `"epubUrl": "/book-data/vbeta/some-sutra.epub"`) pointing to the generated file.

- epub.js loads EPUBs by URL: `ePub('/book-data/vbeta/some-sutra.epub')`
- EPUBs are static assets served from GitHub Pages alongside existing JSON
- Workbox caches EPUBs as standard binary assets — no custom SW logic required
- Build script added to CI pipeline after the existing `build` step
- Zod catalog schema updated to include optional `epubUrl: z.string().optional()` field

**Rationale:** Clean separation of concerns; no runtime conversion overhead; EPUBs are cacheable static assets; aligns with static hosting constraint.

**CFI-based Progress Persistence**

epub.js location (CFI string) replaces integer page index for progress tracking:

```typescript
// reader.store.ts — updated shape
interface ReaderState {
  currentCfi: string | null      // epub.js CFI string for current location
  isChromeVisible: boolean
  // actions
  setCurrentCfi: (cfi: string) => void
  toggleChrome: () => void
  reset: () => void
}
```

`LAST_READ_POSITION` storage key value shape changes:
```typescript
// Before
{ bookId: string, page: number }

// After
{ bookId: string, cfi: string }
```

On resume: `rendition.display(savedCfi)` replaces `readerStore.setCurrentPage(savedPage)`.

### Authentication & Security

No changes from base architecture. No authentication in MVP. Static hosting security (CSP headers, HTTPS) unchanged.

### API & Communication Patterns

**epub.js lifecycle: `useEpubReader` custom hook**

```typescript
// features/reader/useEpubReader.ts
function useEpubReader(epubUrl: string | null): {
  containerRef: React.RefObject<HTMLDivElement>
  rendition: Rendition | null
  book: Book | null
  isReady: boolean
  error: Error | null
}
```

- Hook creates `ePub(epubUrl)` and `book.renderTo(containerRef.current, { flow: 'paginated', width: '100%', height: '100%' })`
- `useEffect` cleanup calls `book.destroy()` on unmount or when `epubUrl` changes
- `isReady` becomes `true` after `rendition.on('ready', ...)` fires
- `error` captures `book.on('openFailed', ...)` and `rendition.on('loadError', ...)`
- `ReaderEngine` consumes this hook; does not manage epub.js objects directly

**epub.js event integration:**

```typescript
// Progress save — fires on every page turn
rendition.on('relocated', (location: Location) => {
  readerStore.setCurrentCfi(location.start.cfi)
  storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, {
    bookId,
    cfi: location.start.cfi,
  })
})

// Navigation events — inside iframe, forwarded via rendition
rendition.on('click', (event: MouseEvent) => {
  const x = event.clientX
  const width = window.innerWidth
  if (x < width * 0.2) rendition.prev()
  else if (x > width * 0.8) rendition.next()
  else readerStore.toggleChrome()
})

rendition.on('keyup', (event: KeyboardEvent) => {
  if (event.key === 'ArrowRight' || event.key === 'PageDown') rendition.next()
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') rendition.prev()
})
```

### Frontend Architecture

**Theming in the epub.js iframe: `rendition.themes` API**

Theme CSS strings are defined in a new `features/reader/epubThemes.ts` constants file, mirroring the Tailwind design tokens:

```typescript
// features/reader/epubThemes.ts
export const EPUB_THEMES = {
  'theme-light': {
    body: { background: '#ffffff', color: '#1a1a1a', fontFamily: 'Lora, serif' },
    p: { lineHeight: '1.8', margin: '0 0 1em 0' },
  },
  'theme-sepia': {
    body: { background: '#f4ecd8', color: '#3b2f2f', fontFamily: 'Lora, serif' },
    p: { lineHeight: '1.8', margin: '0 0 1em 0' },
  },
  'theme-dark': {
    body: { background: '#1a1a1a', color: '#e0d9cc', fontFamily: 'Lora, serif' },
    p: { lineHeight: '1.8', margin: '0 0 1em 0' },
  },
} as const
```

Registration and selection:
```typescript
// In useEpubReader, after rendition is ready
Object.entries(EPUB_THEMES).forEach(([name, styles]) => {
  rendition.themes.register(name, styles)
})
rendition.themes.select(currentTheme)  // e.g. 'theme-sepia'

// Font size applied separately
rendition.themes.fontSize(`${fontSize}px`)
```

On theme/font change: `rendition.themes.select(newTheme)` and `rendition.themes.fontSize(newSize)` — no re-render of the React component required.

**`ReaderEngine` component responsibilities (updated):**
- Renders the container `<div ref={containerRef}>` that epub.js mounts into
- Consumes `useEpubReader(epubUrl)` hook
- Wires `rendition` events for navigation, progress, and chrome toggle
- Passes `isReady` and `error` to loading/error states
- Does NOT manage `Book`/`Rendition` lifecycle directly
- Does NOT call `paginateBook` — `lib/pagination/` is removed

**Removed from codebase:**
- `lib/pagination/paginateBook.ts` and `lib/pagination/paginateBook.test.ts`
- `lib/pagination/pagination.types.ts`
- `useDOMPagination` hook (if extracted)
- `reader.store` fields: `currentPage`, `pages[]`

### Infrastructure & Deployment

**Service Worker EPUB caching**

Add a dedicated Workbox `CacheFirst` runtime cache route in `vite.config.ts`:

```typescript
// vite.config.ts — inside VitePWA runtimeCaching
{
  urlPattern: /\/book-data\/.*\.epub$/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'epub-cache',
    expiration: {
      maxEntries: 20,
      maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
    },
  },
}
```

EPUBs are fetched and cached on first book open. Subsequent opens (including offline) are served from `epub-cache`. The existing `json-cache` strategy for `*.json` files is unchanged.

### Decision Impact Analysis

**Implementation Sequence:**
1. Build script: `apps/reader/scripts/build-epubs.mjs` (JSON→EPUB conversion)
2. Catalog Zod schema update: add `epubUrl` field
3. `reader.store` update: `currentCfi` replaces `currentPage`; update `LAST_READ_POSITION` storage key shape
4. `epubThemes.ts` constants file
5. `useEpubReader` hook
6. `ReaderEngine` rewrite (consumes hook, wires events)
7. Workbox config update: add `epub-cache` runtime route
8. Remove `lib/pagination/` module and all references
9. Update `ReaderPage` to pass `epubUrl` (from catalog) instead of book paragraphs

**Cross-Component Dependencies:**
- `useEpubReader` depends on: `epubThemes.ts`, `reader.store`, `StorageService`
- `ReaderEngine` depends on: `useEpubReader`, `reader.store`, `settings.store` (for theme/fontSize)
- Build script depends on: Phase 1 JSON schema (must stay aligned with crawler output)
- Catalog Zod schema change affects: `DataService`, `useCatalogIndex`, `LibrarySearchHub`, `CategoryPage`
- `LAST_READ_POSITION` shape change affects: `useStorageHydration`, `reader.store`, `ReaderPage` resume logic

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified

8 new areas (on top of the 8 from the base architecture) where AI agents could make incompatible choices specific to the epub.js integration.

### Naming Patterns

**New file naming for epub.js integration:**
- epub.js hook: `useEpubReader.ts` (in `features/reader/`)
- epub.js theme constants: `epubThemes.ts` (in `features/reader/`)
- EPUB build script: `build-epubs.mjs` (in `apps/reader/scripts/`)
- All existing naming conventions from base architecture apply unchanged

**New Zustand action names:**
- `setCurrentCfi(cfi: string)` — replaces `setCurrentPage`
- `toggleChrome()` — unchanged

**New storage key:**
- `LAST_READ_POSITION` constant name unchanged; value shape changes to `{ bookId: string, cfi: string }`

### Structure Patterns

**epub.js objects are owned exclusively by `useEpubReader`:**
- `Book` and `Rendition` objects MUST NOT be created outside `useEpubReader.ts`
- `ReaderEngine.tsx` MUST consume `useEpubReader` — never call `ePub()` directly
- No other component or hook may import from `epubjs` directly except `useEpubReader.ts`

**`lib/pagination/` is removed entirely:**
- Do NOT recreate `paginateBook.ts` or any DOM measurement logic
- Do NOT add a `pages[]` array to `reader.store`
- Do NOT add `currentPage: number` to `reader.store`

### Format Patterns

**`reader.store` shape (authoritative):**
```typescript
interface ReaderState {
  currentCfi: string | null
  isChromeVisible: boolean
  setCurrentCfi: (cfi: string) => void
  toggleChrome: () => void
  reset: () => void
}
```

**`LAST_READ_POSITION` storage value shape (authoritative):**
```typescript
{ bookId: string, cfi: string }
// NOT: { bookId: string, page: number }
```

**Catalog item schema update (authoritative):**
```typescript
// catalog.schema.ts — add to existing CatalogItem
epubUrl: z.string().optional()
// epubUrl is the path to the EPUB file, e.g. "/book-data/vbeta/some-sutra.epub"
```

### Communication Patterns

**epub.js event wiring — authoritative patterns:**

```typescript
// ✅ CORRECT: progress saved in relocated handler (fires on epub.js page turn)
rendition.on('relocated', (location) => {
  readerStore.setCurrentCfi(location.start.cfi)
  storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId, cfi: location.start.cfi })
})

// ❌ WRONG: saving progress in useEffect watching currentCfi
useEffect(() => {
  if (currentCfi) storageService.setItem(...)
}, [currentCfi])
// Fires on React re-renders, not on actual page turns
```

**Navigation — authoritative pattern:**
```typescript
// ✅ CORRECT: navigation via rendition events (works inside iframe)
rendition.on('click', (event) => { /* zone detection */ })

// ❌ WRONG: outer div overlays on top of the epub.js container
<div className="absolute left-0 w-[20%] h-full" onClick={() => rendition?.prev()} />
// Tap events inside the iframe do NOT bubble to outer React DOM
```

**Theming — authoritative pattern:**
```typescript
// ✅ CORRECT: theme via rendition.themes API
rendition.themes.select('theme-sepia')
rendition.themes.fontSize('18px')

// ❌ WRONG: CSS injection via getContents
rendition.getContents().forEach(c => c.addStylesheetRules(...))

// ❌ WRONG: applying font size on the container div
<div style={{ fontSize: `${fontSize}px` }} ref={containerRef} />
// Font size on the outer container does NOT affect epub.js iframe content
```

**epub.js lifecycle — authoritative cleanup pattern:**
```typescript
// ✅ CORRECT: always destroy on cleanup
useEffect(() => {
  const book = ePub(epubUrl)
  // ... setup ...
  return () => { book.destroy() }
}, [epubUrl])

// ❌ WRONG: no cleanup — causes memory leaks across route changes
```

### Process Patterns

**epub.js loading states:**
- Use `isReady` from `useEpubReader` for the "book is rendering" loading state — not a local `useState`
- Show `<SkeletonText>` while `!isReady && !error`
- Show `<ReaderErrorPage>` when `error !== null`

**Page count display (deferred):**
- Do NOT add `currentPage: number` or `totalPages: number` to `reader.store` in MVP
- epub.js `book.locations.generate()` is async and expensive — deferred to post-MVP
- If a progress indicator is needed in MVP, use `location.start.percentage` from the `relocated` event

**epub.js error handling:**
```typescript
// ✅ CORRECT: capture errors via epub.js events in useEpubReader
book.on('openFailed', (err) => setError(err))
rendition.on('loadError', (err) => setError(err))

// ❌ WRONG: try/catch around ePub() constructor
// ePub() is synchronous and doesn't throw; errors fire asynchronously via events
```

### Enforcement Guidelines

**All AI agents MUST:**
- Import `epubjs` only in `features/reader/useEpubReader.ts` — nowhere else
- Apply themes via `rendition.themes.select()` and `rendition.themes.fontSize()` — never via container CSS or `getContents()`
- Wire navigation via `rendition.on('click'/'keyup')` — never via outer DOM overlays
- Save progress in `rendition.on('relocated')` handler — never in a `useEffect` watching `currentCfi`
- Call `book.destroy()` in `useEffect` cleanup — always
- Use `currentCfi: string | null` in `reader.store` — never `currentPage: number`
- Read `epubUrl` from the validated catalog schema — never construct the URL inline in a component

**Pattern Enforcement:**
- ESLint `no-restricted-imports` rule: add `epubjs` to restricted imports with message "Import epub.js only via useEpubReader hook"
- TypeScript strict mode catches `currentPage` references at compile time after removal
- `reader.store` type definition is the single source of truth

## Project Structure & Boundaries

### Complete Project Directory Structure

The monorepo structure and `apps/reader/` directory are inherited from `architecture-reader-ui.md` in full. This section documents only the **changes** introduced by the epub.js integration.

#### New Files

```
apps/reader/
├── scripts/
│   └── build-epubs.mjs             ← NEW: build-time JSON→EPUB conversion script
├── src/
│   ├── features/
│   │   └── reader/
│   │       ├── useEpubReader.ts    ← NEW: epub.js Book/Rendition lifecycle hook
│   │       ├── epubThemes.ts       ← NEW: EPUB_THEMES constants for rendition.themes API
│   │       ├── ReaderEngine.tsx    ← REWRITTEN: consumes useEpubReader, wires events
│   │       └── ReaderEngine.test.tsx ← REWRITTEN: tests for epub.js integration
│   ├── shared/
│   │   └── schemas/
│   │       └── catalog.schema.ts   ← UPDATED: add epubUrl field to CatalogItem
│   └── stores/
│       └── reader.store.ts         ← UPDATED: currentCfi replaces currentPage/pages[]
```

#### Removed Files

```
apps/reader/src/
└── lib/
    └── pagination/                 ← REMOVED entirely
        ├── paginateBook.ts         ← REMOVED
        ├── paginateBook.test.ts    ← REMOVED
        └── pagination.types.ts     ← REMOVED
```

#### Updated Files

| File | Change |
|------|--------|
| `src/stores/reader.store.ts` | `currentCfi: string \| null` replaces `currentPage: number` and `pages[]` |
| `src/shared/schemas/catalog.schema.ts` | Add `epubUrl: z.string().optional()` |
| `src/shared/constants/storage.keys.ts` | `LAST_READ_POSITION` value shape documented as `{ bookId, cfi }` |
| `src/features/reader/ReaderEngine.tsx` | Full rewrite: epub.js container, consumes `useEpubReader` |
| `src/features/reader/ReaderEngine.test.tsx` | Full rewrite: epub.js integration tests |
| `src/shared/hooks/useStorageHydration.ts` | Handle `cfi` field instead of `page` on hydration |
| `src/features/reader/ReaderPage.tsx` | Pass `epubUrl` from catalog to `ReaderEngine` |
| `vite.config.ts` | Add `epub-cache` Workbox `CacheFirst` runtime route |
| `.eslintrc.cjs` | Add `epubjs` to `no-restricted-imports` |

### Architectural Boundaries

**epub.js Boundary:**
- `useEpubReader.ts` is the single integration point for epub.js
- Everything outside `useEpubReader.ts` interacts with epub.js only through the hook's return values (`rendition`, `book`, `isReady`, `error`)
- No component, store, or service may import from `epubjs` directly

**Pagination Boundary (removed):**
- `lib/pagination/` no longer exists
- epub.js owns all pagination and layout — no React-side page calculation

**Storage Boundary (updated):**
- `LAST_READ_POSITION` value shape is `{ bookId: string, cfi: string }` — enforced by TypeScript
- `useStorageHydration` reads `cfi` and calls `readerStore.setCurrentCfi(cfi)` on app init

**Content Format Boundary:**
- `DataService` / `useCatalogIndex` serve catalog items with optional `epubUrl`
- `ReaderPage` reads `epubUrl` from the catalog item and passes it to `ReaderEngine`
- `ReaderEngine` passes `epubUrl` to `useEpubReader` — never constructs the URL itself
- EPUB files are static assets at `/book-data/**/*.epub` — built by `build-epubs.mjs`

### Requirements to Structure Mapping

| FR | Requirement | Primary File(s) |
|----|-------------|-----------------|
| FR5 | Open and read sutra | `features/reader/ReaderPage.tsx`, `useEpubReader.ts` |
| FR6 | Page-flip navigation | `features/reader/ReaderEngine.tsx` (via `rendition.on('click'/'keyup')`) |
| FR7 | Dynamic pagination | epub.js `Rendition` with `flow: 'paginated'` (replaces `paginateBook`) |
| FR8 | Error states | `useEpubReader.ts` error capture → `ReaderErrorPage.tsx` |
| FR9 | Offline access | `vite.config.ts` epub-cache + existing json-cache Workbox routes |
| FR13 | Resume last position | `reader.store.ts` (`currentCfi`) + `useStorageHydration.ts` + `rendition.display(cfi)` |
| FR14 | Font size control | `epubThemes.ts` + `rendition.themes.fontSize()` in `useEpubReader.ts` |
| FR15 | Reading themes | `epubThemes.ts` + `rendition.themes.select()` in `useEpubReader.ts` |
| FR1–FR4, FR10–FR12, FR16 | All other FRs | Unchanged from base architecture |

### Data Flow

```
1. App init (unchanged):
   useStorageHydration → localforage → hydrate Zustand stores
   → reader.store: { currentCfi: savedCfi | null }  (was: currentPage)

2. Catalog fetch (unchanged):
   useCatalogIndex() → DataService → fetch index.json → catalog.schema.ts (Zod, now includes epubUrl)

3. Book open (updated):
   ReaderPage reads epubUrl from catalog item
   → passes epubUrl to ReaderEngine
   → ReaderEngine passes to useEpubReader(epubUrl)
   → useEpubReader: ePub(epubUrl) → book.renderTo(containerRef) → rendition ready
   → if savedCfi: rendition.display(savedCfi)  (was: setCurrentPage(savedPage))

4. Page turn (updated):
   rendition.on('click') → zone detection → rendition.next() / rendition.prev()
   → rendition.on('relocated') fires
   → readerStore.setCurrentCfi(location.start.cfi)
   → storageService.setItem(LAST_READ_POSITION, { bookId, cfi })  (was: { bookId, page })

5. Theme/font change (updated):
   settings.store.setTheme(theme) / setFontSize(size)
   → useEpubReader effect: rendition.themes.select(theme) / rendition.themes.fontSize(size)
   (was: paginateBook recalculation + CSS on <html>)

6. Book close / route change:
   useEpubReader useEffect cleanup: book.destroy()
   reader.store.reset()
```

### Development & Deployment

**Build pipeline addition:**
```
lint → typecheck → pnpm run build:epubs → unit tests → vite build → e2e tests → deploy
```

`build:epubs` script in `package.json`:
```json
"build:epubs": "node scripts/build-epubs.mjs"
```

EPUB files output to `public/book-data/` (or served alongside JSON in dev via mock server).

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All decisions are compatible. epub.js integrates cleanly into the existing React 18 + Vite + Zustand + TanStack Query stack. The `useEpubReader` hook pattern is consistent with existing hooks. `rendition.themes` is epub.js's official theming mechanism. `CacheFirst` for binary EPUB assets is a standard Workbox pattern. No version conflicts.

**Pattern Consistency:** All new patterns follow existing conventions: hook in `features/reader/`, constants file alongside the hook, co-located tests, TypeScript interfaces for store state, `storageService` for all persistence. The `epubjs` restricted-import ESLint rule extends the existing pattern for `localStorage`/`indexedDB`.

**Structure Alignment:** The delta structure is minimal and surgical. Feature-based directory, co-located tests, and barrel export rules from the base architecture are all respected.

### Requirements Coverage Validation ✅

All 12 FRs are architecturally supported. FRs 1–4, 10–12, 16 are unchanged from the base architecture. FRs 5–9, 13–15 are covered by the epub.js integration decisions documented above.

**NFR Coverage:**

| NFR | Architectural Support |
|-----|----------------------|
| TTI < 2s | SW cache-first unchanged; EPUB cached after first open |
| Page turn < 50ms | `rendition.next()`/`prev()` are synchronous epub.js calls; no React re-render required |
| Async locations generation | Deferred to post-MVP; `location.start.percentage` used for MVP progress indicator |
| WCAG AA contrast | `epubThemes.ts` tokens validated against same design system as base architecture |
| Offline reading | `epub-cache` CacheFirst covers EPUB binary assets |
| Memory safety | `book.destroy()` in `useEffect` cleanup enforced by pattern and ESLint |

### Gap Analysis & Resolutions

**Gap 1 — EPUB conversion library: RESOLVED**

`build-epubs.mjs` uses **jszip** for JSON→EPUB conversion. jszip is already in the dependency tree (epub.js uses it internally). The EPUB structure for Buddhist text JSON is minimal:

```
mimetype
META-INF/container.xml
OEBPS/content.opf
OEBPS/content.xhtml   ← title + paragraph array rendered as HTML
OEBPS/toc.ncx
```

`build-epubs.mjs` script responsibilities:
1. Read all `book-data/**/*.json` files
2. For each book: generate `.epub` using jszip + minimal EPUB structure
3. Write `.epub` to `public/book-data/` (mirroring JSON path structure)
4. Patch `index.json` to add `epubUrl` field to each catalog entry
5. Write updated `index.json`

**Gap 2 — `epubUrl` in `index.json`: RESOLVED**

`build-epubs.mjs` handles both EPUB generation and `index.json` patching in a single script. One `pnpm run build:epubs` command produces both the EPUB files and the updated catalog.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed (brownfield library swap, 6 cross-cutting concerns)
- [x] Scale and complexity assessed (Medium — well-bounded scope, non-trivial iframe integration)
- [x] Technical constraints identified (iframe model, EPUB format, static hosting, CFI persistence)
- [x] Cross-cutting concerns mapped (6 identified and addressed)

**✅ Architectural Decisions**
- [x] Critical decisions documented (EPUB format strategy, lifecycle hook, CFI persistence, theming)
- [x] Technology additions specified (epub.js, jszip for build script)
- [x] Integration patterns defined (useEpubReader hook, rendition.themes, rendition events)
- [x] Performance considerations addressed (< 50ms page turn, async locations deferred)

**✅ Implementation Patterns**
- [x] 8 new conflict points identified and addressed
- [x] Naming conventions established (useEpubReader, epubThemes, build-epubs)
- [x] Communication patterns specified (relocated handler, click/keyup events)
- [x] Process patterns documented (loading states, error handling, lifecycle cleanup)
- [x] Anti-patterns explicitly documented with ❌ examples

**✅ Project Structure**
- [x] New files specified (useEpubReader.ts, epubThemes.ts, build-epubs.mjs)
- [x] Removed files specified (lib/pagination/ entirely)
- [x] Updated files enumerated with change descriptions
- [x] All 12 FRs mapped to specific files
- [x] Data flow updated end-to-end

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level: High**

**Key Strengths:**
- epub.js integration is architecturally isolated behind `useEpubReader` — can be built and tested independently
- All existing architecture (library, search, settings, storage, PWA shell) is completely unchanged — low regression risk
- `lib/pagination/` removal is clean — no partial migration, no dual-path code
- CFI-based progress is a strict type change — TypeScript enforces the migration at compile time
- Build-time EPUB conversion keeps runtime simple — no browser-side conversion complexity
- Anti-patterns are explicitly documented — agents know exactly what NOT to do

**Areas for Future Enhancement:**
- epub.js `book.locations.generate()` for accurate page count display (post-MVP)
- Explicit "download for offline" user action with progress indicator (post-MVP)
- MiniSearch index over EPUB content if full-text search inside books is desired
- epub.js Web Worker offloading if locations generation blocks UI on low-end devices

### Implementation Handoff

**AI Agent Guidelines:**
- Read `architecture-reader-ui.md` (base) alongside this document — this document is a delta, not a replacement
- Follow all base architecture patterns unchanged for non-reader features
- For reader feature: follow this document's decisions exactly
- `useEpubReader.ts` is the single integration point — do not import `epubjs` anywhere else

**First Implementation Story:**
```bash
# 1. Add epub.js dependency
cd apps/reader && pnpm add epubjs

# 2. Add jszip for build script (if not already transitive)
pnpm add -D jszip

# 3. Implement build-epubs.mjs script
# 4. Update catalog.schema.ts with epubUrl field
# 5. Update reader.store.ts (currentCfi replaces currentPage)
# 6. Implement useEpubReader.ts hook
# 7. Rewrite ReaderEngine.tsx
# 8. Update vite.config.ts (epub-cache Workbox route)
# 9. Remove lib/pagination/ and all references
```
