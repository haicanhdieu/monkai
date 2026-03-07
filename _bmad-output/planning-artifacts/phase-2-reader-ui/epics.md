---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - _bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md
  - _bmad-output/planning-artifacts/phase-2-reader-ui/architecture.md
  - _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md
---

# monkai - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for monkai Phase 2 (Reader UI), decomposing the requirements from the PRD, UX Design, and Architecture documents into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Users can browse the library catalog by predefined categories (e.g., Nikaya, Đại Thừa).
FR2: Users can view a list of individual sutras within a selected category.
FR3: Users can search for specific sutras by title or keywords across the entire catalog.
FR4: The system can display search results instantly from the locally cached catalog index.
FR5: Users can open a specific sutra and read its contents.
FR6: Users can navigate forward and backward through the text using discrete page turns (tapping/swiping) rather than vertical scrolling.
FR7: The system can dynamically paginate text content based on the user's current screen dimensions and selected font size.
FR8: The system can gracefully handle and display error states if a specific text fails to load or parse.
FR9: Users can access the library catalog and any previously requested sutras without an active internet connection.
FR10: The system can cache the application shell and catalog index automatically upon initial visit.
FR11: The system can seamlessly fetch updated catalog data in the background when the user is online.
FR12: The system can persist reading progress and states using an abstracted, cross-platform storage layer.
FR13: Users can resume reading from their exact last-saved position when reopening the app or a specific sutra.
FR14: Users can increase or decrease the text font size.
FR15: Users can toggle between different reading visual themes (e.g., Day, Night, Sepia).
FR16: The system applies user customization preferences persistently across all reading sessions.

### NonFunctional Requirements

NFR1 (Performance - TTI): Time to Interactive must be under 2.0 seconds on a 3G mobile connection after the initial Service Worker cache is populated.
NFR2 (Performance - Pagination Render): The client-side pagination engine must calculate and render a new chapter (up to 500 paragraphs) in under 100 milliseconds to prevent UI freezing.
NFR3 (Performance - Page Turn Latency): Tapping or swiping to the next page must respond visually in under 50 milliseconds (60fps) to feel instantaneous.
NFR4 (Reliability - Offline): 100% of core reading features (browsing catalog, reading downloaded texts, changing settings, saving bookmarks) must function without an internet connection.
NFR5 (Reliability - Storage Resilience): The application must gracefully handle browser storage limits (e.g., QuotaExceededError) by alerting the user, rather than crashing silently.
NFR6 (Accessibility - WCAG): Visual design elements (especially in Day, Night, and Sepia themes) must meet WCAG AA standards for contrast ratios (minimum 4.5:1 for normal text).
NFR7 (Accessibility - Legibility): The UI must support dynamic text scaling up to 200% without breaking the layout or overlapping elements.
NFR8 (Accessibility - Touch Targets): All interactive elements (page turn zones, buttons, links) must have a minimum touch target size of 44x44 CSS pixels.

### Additional Requirements

**From Architecture Document:**

- **Starter Template:** Use `@vite-pwa/create-pwa` (react-ts) scaffold. This is the first implementation story — sets up Vite 7 + React 18 + TypeScript + vite-plugin-pwa (Workbox) + Web App Manifest. Pin React 18 if needed.
- **Monorepo structure:** All reader code lives in `apps/reader/`. Crawler migrates to `apps/crawler/` via `git mv`. `devbox.json` updated with `dev`, `build`, `test` scripts for `apps/reader/`.
- **Tailwind CSS:** Pin to v3 (`^3.4.x`). Define design tokens (kem `#F5EDD6`, nâu trầm `#3D2B1F`, vàng đất `#C8883A`) in `tailwind.config.ts`.
- **StorageService abstraction:** `StorageService` interface in `shared/services/storage.service.ts` — MVP: `LocalforageStorageService`. All stores hydrate from this interface on app start. No direct `localStorage`/`indexedDB` access allowed in components.
- **TanStack Query v5:** `staleTime: Infinity`, `gcTime: Infinity`. Queries: `useCatalogIndex()`, `useBook(id)`, `useCategory(slug)`. All keys from `query.keys.ts`.
- **Zustand stores with Immer middleware:** `reader.store.ts`, `settings.store.ts`, `bookmarks.store.ts`. Actions use `set`/`toggle` prefix convention.
- **Pagination engine:** Pure TypeScript in `lib/pagination/paginateBook.ts` — zero React/DOM/Zustand dependency. Called via `useMemo` in `ReaderEngine.tsx`. Must pass unit test: 500 paragraphs < 100ms.
- **Font strategy:** Self-hosted fonts in `public/fonts/` — Lora (sutra text, `font-display: block`), Inter (UI). `ReaderEngine` gates pagination behind `document.fonts.ready`.
- **Search library:** MiniSearch (`minisearch@^7.x`, ~7kb gzipped) for better Vietnamese tokenization. Index built once from `useCatalogIndex()` result, stored in `useMemo`.
- **Service Worker (Workbox):** `generateSW` strategy via `vite-plugin-pwa`. Cache-first for app shell and book-data JSON. Background sync for catalog updates.
- **Zod validation:** All Phase 1 JSON validated at service boundary. `book.schema.ts`, `catalog.schema.ts` in `shared/schemas/`.
- **Environment vars:** `VITE_BASE_PATH`, `VITE_BOOK_DATA_URL` for GitHub Pages subpath support and local dev mock server.
- **Mock server:** `apps/reader/scripts/mock-server.mjs` — Node built-in, serves `../../book-data/` locally on port 3001.
- **CI/CD:** GitHub Actions: lint → typecheck → unit tests → build → E2E tests (Playwright) → deploy to GitHub Pages.
- **Phase 3 seam:** `DataService` interface wraps fetch — swap `StaticJsonDataService` for `ApiDataService` without touching components.
- **ESLint enforcement:** `no-restricted-imports` blocks direct `localStorage`/`indexedDB`. `no-restricted-syntax` flags inline TanStack Query key arrays.

**From UX Design Document:**

- **Chromeless reader UI:** All navigation chrome (top/bottom bars) hidden during active reading. Center-tap (60% zone) toggles chrome visibility. Left/right 20% zones are pagination tap targets.
- **First-touch tooltip:** On very first load, chrome is visible with a brief text hint ("Chạm vào giữa màn hình để hiện menu") that fades out after the first center-tap interaction.
- **Ephemeral highlights:** When navigating via search to a specific paragraph, highlight the target text for 1.5 seconds before fading to match the text color.
- **Bottom navigation:** Four primary tabs: Trang Chủ (Home), Thư Viện (Library), Đánh Dấu (Bookmarks), Cài Đặt (Settings).
- **Smart Resume home screen:** Home screen primary action is a "Continue Reading" hero card. If no `lastRead` state exists, redirects to Library instead.
- **Reading column constraint:** Max-width ~700px (65-70 characters per line) on tablet/desktop for optimal reading ergonomics.
- **Mobile-first responsive:** Mobile — full width with tap zones. Tablet/Desktop (≥768px) — constrained text column, margin areas become pagination zones.
- **Keyboard navigation:** Arrow keys and Page Up/Down for pagination on desktop.
- **Skeleton text loading states:** No generic spinners — use pulsing skeleton blocks matching sutra text line-height.
- **Silent saves:** Progress saved on every page turn without user confirmation. Optimistic UI for all settings changes.
- **Offline error state:** Graceful themed "content unavailable" page with direct pathway back to locally available Library (no raw browser errors).
- **PWA install prompt:** Subtle, standard browser prompts only after engagement (reading multiple pages) — no aggressive banners.
- **Subdued notifications:** No high-contrast toasts. Use in-place icon/state swaps matching the active reading theme.
- **ARIA landmarks:** Custom pagination view must expose logical ARIA landmarks for screen readers.
- **Relative units only:** CSS uses `rem`, `em`, `vh`, `vw`, `ch` — no fixed `px` for typography or containers.
- **Three reading themes:** Sepia (default), Light, Dark — all validated for WCAG AA 4.5:1 contrast. Theme class set only on `<html>` element.

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 2 | Browse by category |
| FR2 | Epic 2 | List sutras in category |
| FR3 | Epic 2 | Search by title/keyword |
| FR4 | Epic 2 | Instant offline search results |
| FR5 | Epic 3 | Open and read sutra |
| FR6 | Epic 3 | Page-flip navigation |
| FR7 | Epic 3 | Dynamic pagination by viewport + font |
| FR8 | Epic 3 | Graceful error states |
| FR9 | Epic 1 + 4 | App shell offline (E1), full book data offline (E4) |
| FR10 | Epic 1 + 4 | App shell cache (E1), book-data cache (E4) |
| FR11 | Epic 4 | Background catalog sync |
| FR12 | Epic 4 | Cross-platform StorageService abstraction |
| FR13 | Epic 4 | Resume last read position |
| FR14 | Epic 5 | Font size control |
| FR15 | Epic 5 | Day/Night/Sepia themes |
| FR16 | Epic 5 | Persistent preferences |

## Epic List

### Epic 1: Installable PWA Foundation
Users can install the Monkai app to their home screen and open a working, navigable app shell — even offline.
**FRs covered:** FR9 (partial — app shell), FR10 (partial — app shell cache)
**NFRs addressed:** NFR1 (TTI foundation via SW)

### Epic 2: Library Discovery & Search
Users can browse Buddhist text categories and find any specific sutra instantly — works fully offline against the cached catalog.
**FRs covered:** FR1, FR2, FR3, FR4
**NFRs addressed:** NFR4 (offline catalog search)

### Epic 3: Immersive Sutra Reader
Users can open any sutra and read it with a beautiful, paginated, chromeless interface that responds instantly to every page turn.
**FRs covered:** FR5, FR6, FR7, FR8
**NFRs addressed:** NFR2 (< 100ms pagination), NFR3 (< 50ms page turn), NFR7 (200% scaling), NFR8 (44px touch targets)

### Epic 4: Offline Reading & Seamless Continuity
Users can read any previously opened sutra without internet and return to the exact page they left off — automatically, every session.
**FRs covered:** FR9 (full), FR10 (full), FR11, FR12, FR13
**NFRs addressed:** NFR4 (100% offline), NFR5 (storage quota)

### Epic 5: Reading Personalization
Users can tailor their reading environment with font sizes and visual themes that persist silently across every session.
**FRs covered:** FR14, FR15, FR16
**NFRs addressed:** NFR6 (WCAG AA), NFR7 (200% text scaling)

---

## Epic 1: Installable PWA Foundation

Users can install the Monkai app to their home screen and open a working, navigable app shell — even offline.

### Story 1.1: Monorepo Setup & App Scaffold

As a **developer**,
I want the monorepo structure established and the React PWA app scaffolded with all dependencies,
So that the team has a consistent, working development environment to build upon.

**Acceptance Criteria:**

**Given** the monkai repository root
**When** the developer runs `git mv` to migrate crawler files
**Then** `apps/crawler/` contains all Phase 1 files (`crawler.py`, `models.py`, `utils/`, `config.yaml`, `pyproject.toml`) and `uv run pytest` still passes from `apps/crawler/`

**Given** `apps/reader/` is scaffolded via `npm create @vite-pwa/pwa@latest` (react-ts)
**When** all dependencies are installed
**Then** `package.json` pins: `tailwindcss@^3.4.x`, `react-router-dom`, `zustand`, `@tanstack/react-query`, `localforage`, `zod`, `minisearch`, `@radix-ui/react-slider`, `@radix-ui/react-dialog`, `vitest`, `@testing-library/react`, `playwright`, `concurrently`

**Given** the `devbox.json` at repo root
**When** a developer runs each command
**Then** `devbox run crawl` executes `cd apps/crawler && uv run python crawler.py`, `devbox run dev` starts both mock server and Vite concurrently, `devbox run build` builds the reader, `devbox run test` runs Vitest

**Given** `apps/reader/scripts/mock-server.mjs` using Node built-in `http`
**When** the developer runs `node scripts/mock-server.mjs`
**Then** the server serves files from `../../book-data/` on `http://localhost:3001` with CORS headers for `http://localhost:5173`

**Given** `.env.development` sets `VITE_BOOK_DATA_URL=http://localhost:3001` and `.env` sets `VITE_BASE_PATH=/`
**When** the Vite dev server starts
**Then** requests to `/book-data/*` are proxied to `http://localhost:3001`

**Given** `tsconfig.json` and `vite.config.ts`
**When** a developer imports using `@/`
**Then** the alias resolves to `apps/reader/src/`

**Given** `.eslintrc.cjs` with `no-restricted-imports` rule
**When** any source file imports `localStorage` or `indexedDB` directly
**Then** ESLint reports an error and CI fails

---

### Story 1.2: Design System & Reading Themes

As a **developer**,
I want Tailwind configured with Monkai's design tokens and three reading themes defined as CSS custom properties,
So that all future components use consistent, accessible colors and typography from the start.

**Acceptance Criteria:**

**Given** `tailwind.config.ts`
**When** a component uses `bg-kem`, `text-nau-tram`, or `text-vang-dat`
**Then** the colors resolve to `#F5EDD6`, `#3D2B1F`, and `#C8883A` respectively

**Given** `index.css` with `.theme-sepia`, `.theme-light`, `.theme-dark` CSS custom property blocks
**When** one of those classes is applied to the `<html>` element
**Then** all themed CSS custom properties (`--color-background`, `--color-text`, `--color-accent`) update accordingly across all consuming components

**Given** Lora and Inter font files in `public/fonts/`
**When** `index.css` declares `@font-face` for each
**Then** Lora uses `font-display: block` and Inter uses `font-display: swap`

**Given** all three reading themes
**When** a Vitest test checks each theme's text-to-background contrast ratio
**Then** all three pass WCAG AA minimum 4.5:1 contrast ratio

---

### Story 1.3: App Shell, Routing & Bottom Navigation

As a **user**,
I want to open the Monkai app and see a navigable shell with four tabs,
So that I can orient myself and move between the app's major sections.

**Acceptance Criteria:**

**Given** the app is opened at the root URL
**When** the shell loads
**Then** a `<BottomNav>` component renders four tabs: Trang Chủ (`/`), Thư Viện (`/library`), Đánh Dấu (`/bookmarks`), Cài Đặt (`/settings`), each with an icon and label

**Given** React Router v6 with `basename={import.meta.env.VITE_BASE_PATH ?? '/'}`
**When** a user taps any bottom nav tab
**Then** the URL updates and the correct placeholder page renders without a full page reload, and the tapped tab appears active

**Given** routes `/read/:bookId` and `/library/:category`
**When** navigated to directly by deep link
**Then** the correct placeholder page renders and the bottom nav highlights the appropriate parent tab

**Given** React Router `React.lazy()` per route
**When** `vite build` runs
**Then** each route produces a separate chunk in `dist/`

**Given** `shared/constants/routes.ts` exports all route path constants
**When** any component navigates programmatically
**Then** it imports from `routes.ts` — no hardcoded path strings exist in component files

---

### Story 1.4: PWA Manifest & App Shell Service Worker

As a **user**,
I want to install Monkai to my home screen and open the app shell instantly without a network connection,
So that the app feels native and always available.

**Acceptance Criteria:**

**Given** `vite-plugin-pwa` configured with `generateSW` strategy
**When** `vite build` runs
**Then** `manifest.webmanifest` contains: `name: "Monkai"`, `display: "standalone"`, `theme_color: "#C8883A"`, `background_color: "#F5EDD6"`, icons at 192×192 and 512×512 (maskable)

**Given** Workbox precaches the app shell (HTML, JS, CSS, font files)
**When** a user visits the app for the first time and the SW installs, then goes offline
**Then** subsequent visits load the full app shell from cache with zero network requests (verified by Playwright test with offline network interception)

**Given** `public/offline.html` styled with Sepia theme colors
**When** a user navigates to an uncached URL while offline
**Then** the SW serves `offline.html` with a calm message and a link back to Home (`/`)

**Given** `public/_headers`
**When** the app is served from GitHub Pages
**Then** a `Content-Security-Policy` header is present

**Given** a new SW version is detected on revisit
**When** the SW `waiting` event fires
**Then** a subtle non-blocking prompt appears offering to reload — the app does not force-refresh automatically

---

### Story 1.5: CI/CD Pipeline & Testing Infrastructure

As a **developer**,
I want automated quality gates running on every push to `main`,
So that regressions are caught automatically and the app deploys to GitHub Pages without manual intervention.

**Acceptance Criteria:**

**Given** `.github/workflows/ci.yml` with path filter `apps/reader/**`
**When** code is pushed to `main` with changes in `apps/reader/`
**Then** the pipeline runs in sequence: ESLint → `tsc --noEmit` → Vitest → `vite build` → Playwright E2E → GitHub Pages deploy; any step failure halts the pipeline

**Given** `vitest.config.ts` with jsdom environment and `@testing-library/react`
**When** `pnpm test` runs
**Then** it discovers co-located `*.test.ts` and `*.test.tsx` files and exits 0, including at least the WCAG contrast test from Story 1.2

**Given** `playwright.config.ts` running against built `dist/` via `vite preview`
**When** `pnpm e2e` runs
**Then** a smoke test passes: app shell loads, all 4 bottom nav tabs are visible, navigating between tabs works without errors

**Given** a commit introducing a direct `localStorage` import
**When** the CI lint step runs
**Then** the pipeline fails at lint with a clear ESLint error, and deployment is skipped

---

## Epic 2: Library Discovery & Search

Users can browse Buddhist text categories and find any specific sutra instantly — works fully offline against the cached catalog.

### Story 2.1: Data Layer — Schemas, Services & Query Hooks

As a **developer**,
I want a validated data layer with Zod schemas, service interfaces, and TanStack Query hooks,
So that all components fetch and consume Phase 1 JSON data consistently and safely.

**Acceptance Criteria:**

**Given** `shared/schemas/catalog.schema.ts` with a Zod schema for `index.json`
**When** `catalog.schema.safeParse()` is called with valid Phase 1 catalog JSON
**Then** it returns a typed `CatalogIndex` object with `books` array and category metadata

**Given** `shared/schemas/book.schema.ts` with a Zod schema for individual book JSON
**When** `book.schema.safeParse()` is called with a Phase 1 book file
**Then** it returns a typed `Book` object including `id`, `title`, `category`, `subcategory`, and `content` (array of paragraph strings)

**Given** `DataService` interface in `shared/services/data.service.ts` with methods `getCatalog()` and `getBook(id)`
**When** `StaticJsonDataService` implements this interface
**Then** it fetches from `${import.meta.env.VITE_BOOK_DATA_URL}/book-data/index.json` and `/book-data/{id}.json`, validates with Zod, and throws a typed `DataError` on parse failure

**Given** `shared/constants/query.keys.ts` with factory functions
**When** any component calls `queryKeys.catalog()` or `queryKeys.book(id)`
**Then** it returns a stable, typed array key; no inline array literals exist in any component file

**Given** `QueryClient` configured in `main.tsx` with `staleTime: Infinity` and `gcTime: Infinity`
**When** `useCatalogIndex()` is called from any component
**Then** the catalog JSON is fetched once, cached indefinitely for the session, and never re-fetched on component remount

**Given** a Vitest unit test for `StaticJsonDataService`
**When** the mock server returns valid catalog JSON
**Then** `getCatalog()` resolves with a correctly typed `CatalogIndex`
**And** when the mock returns malformed JSON, `getCatalog()` rejects with a `DataError`

---

### Story 2.2: Category Browse — Library & Category Pages

As a **user**,
I want to browse Buddhist text categories and see the list of sutras within each category,
So that I can discover texts by tradition or topic even without knowing an exact title.

**Acceptance Criteria:**

**Given** the user navigates to `/library`
**When** `LibraryPage` renders with `useCatalogIndex()` data
**Then** a grid of category cards is displayed (Nikaya, Đại Thừa, Thiền Tông, etc.) with the category name and sutra count

**Given** the catalog is loading
**When** `LibraryPage` renders before data arrives
**Then** `<SkeletonText>` blocks matching the card grid layout are shown — no spinner

**Given** the user taps a category card
**When** `CategoryPage` renders at `/library/:category`
**Then** a list of `<SutraListCard>` components shows each sutra's title, subcategory, and translator name from the catalog

**Given** `<SutraListCard>` for a sutra entry
**When** rendered
**Then** it has a minimum touch target of 44×44px, shows the sutra title in Lora font, and navigates to `/read/:bookId` on tap

**Given** the catalog fetch fails (e.g., book-data unreachable and not cached)
**When** `LibraryPage` renders with TanStack Query `error` state
**Then** `<ErrorPage>` renders with a calm themed message — no raw error object shown to user

---

### Story 2.3: Global Search with MiniSearch

As a **user**,
I want to instantly search for any sutra by title or keyword across the entire catalog,
So that I can find a specific text without needing to know its category.

**Acceptance Criteria:**

**Given** `LibrarySearchHub` renders within `LibraryPage`
**When** the search input is empty
**Then** the category grid is shown below the persistent search bar

**Given** the user types into the search bar
**When** the debounced input (250ms) fires
**Then** the category grid is replaced by `<SearchResults>` showing filtered sutra titles matching the query against the MiniSearch index

**Given** a MiniSearch index built once via `useMemo` from `useCatalogIndex()` data
**When** built
**Then** it indexes `title`, `category`, and `subcategory` fields with title boosted (×3) over other fields

**Given** the user searches "Bát Nhã"
**When** results render
**Then** sutras containing "Bát Nhã" in their title appear within 250ms of the last keystroke, with the matched term visually highlighted

**Given** the search query returns no matches
**When** `<SearchResults>` renders
**Then** a calm "Không tìm thấy kết quả" message is shown with a suggestion to try a shorter keyword

**Given** the user taps a search result
**When** navigation occurs
**Then** the user is taken to `/read/:bookId` for the selected sutra

**Given** the app is fully offline with a cached catalog
**When** the user performs a search
**Then** search results appear identically to the online experience — MiniSearch operates entirely client-side

---

## Epic 3: Immersive Sutra Reader

Users can open any sutra and read it with a beautiful, paginated, chromeless interface that responds instantly to every page turn.

### Story 3.1: Pagination Engine (Pure TypeScript)

As a **developer**,
I want a standalone, testable pagination engine that splits paragraph arrays into viewport-sized pages,
So that the reader can calculate page breaks in under 100ms without blocking the UI thread.

**Acceptance Criteria:**

**Given** `lib/pagination/paginateBook.ts` exports `paginateBook(paragraphs: string[], options: PaginationOptions): string[][]`
**When** called with any input
**Then** it has zero imports from React, DOM APIs, Zustand, or TanStack Query — pure TypeScript only

**Given** `PaginationOptions` includes `{ viewportHeight: number, fontSize: number, lineHeight: number, paddingVertical: number }`
**When** `paginateBook` is called
**Then** each returned page contains only paragraphs that fit within `viewportHeight` given the font metrics — no paragraph is split across pages

**Given** a Vitest unit test calling `paginateBook` with an array of 500 paragraphs
**When** the test runs
**Then** it completes in under 100ms (measured via `performance.now()`) and asserts this as a test condition

**Given** an array of 0 paragraphs
**When** `paginateBook` is called
**Then** it returns `[[]]` (one empty page) without throwing

**Given** a single paragraph longer than the viewport height
**When** `paginateBook` is called
**Then** that paragraph occupies its own page (no infinite loop, no crash)

---

### Story 3.2: Reader Page & Book Data Loading

As a **user**,
I want to open a sutra from the library and see it begin loading immediately,
So that I can start reading without waiting for a slow network request.

**Acceptance Criteria:**

**Given** the user taps a `<SutraListCard>` or search result
**When** navigation to `/read/:bookId` occurs
**Then** `ReaderPage` renders and immediately calls `useBook(bookId)` via TanStack Query

**Given** `useBook(id)` fetches `/book-data/{id}.json` and validates with `book.schema.ts`
**When** data is loading
**Then** `<SkeletonText>` blocks fill the reading area with pulsing lines matching the expected text line-height

**Given** the book JSON is cached by TanStack Query from a previous visit
**When** `ReaderPage` mounts
**Then** the book renders instantly with zero network requests

**Given** `reader.store.ts` (Zustand) with fields `{ bookId, pages, currentPage, isChromeVisible }`
**When** book data loads successfully
**Then** `reader.store.setBookId(id)` and `reader.store.setPages([])` are called to reset state for the new book

**Given** the book JSON fails Zod validation
**When** `useBook` returns an error
**Then** `<ReaderErrorPage>` renders with a calm message: "Không thể tải nội dung kinh này" and a back link to the Library

---

### Story 3.3: ReaderEngine — Paginated Reading with Tap & Swipe

As a **user**,
I want to flip through a sutra's pages by tapping or swiping left and right,
So that reading feels like turning pages in a physical book rather than scrolling a website.

**Acceptance Criteria:**

**Given** `ReaderEngine` receives `book.content` (paragraphs array) and mounts
**When** `document.fonts.ready` resolves
**Then** `paginateBook(paragraphs, { viewportHeight, fontSize, lineHeight })` is called inside `useMemo`, the result is stored in `reader.store.setPages(pages)`, and the first page renders

**Given** the user taps the right 20% of the screen (or swipes left)
**When** the gesture is detected
**Then** `reader.store.setCurrentPage(currentPage + 1)` is called, the next page of paragraphs renders, and the visual response occurs within 50ms

**Given** the user taps the left 20% of the screen (or swipes right)
**When** the gesture is detected
**Then** the previous page renders; if already on page 1, no action occurs

**Given** the user is on the last page
**When** they tap the right zone
**Then** no navigation occurs and no error is thrown

**Given** the reading column on tablet/desktop (viewport ≥ 768px)
**When** rendered
**Then** the text column is constrained to max-width ~700px (65–70ch), centered, with left/right margins acting as tap zones

**Given** the user is on desktop
**When** they press the right Arrow key or Page Down
**Then** the next page renders; left Arrow or Page Up renders the previous page

**Given** `<PageProgress>` at the bottom of the reading area
**When** any page renders
**Then** it shows the current page and total pages (e.g., "14 / 89") in Inter font, subdued styling

---

### Story 3.4: ChromelessLayout — Immersive Reading Mode

As a **user**,
I want the navigation UI to disappear when I'm reading and reappear when I tap the center of the screen,
So that I can be fully immersed in the text without distracting interface elements.

**Acceptance Criteria:**

**Given** `ChromelessLayout` wraps `ReaderEngine` and reads `isChromeVisible` from `reader.store`
**When** `isChromeVisible` is `false`
**Then** the top bar (book title, back button) and bottom bar (page progress, settings shortcut) are hidden with opacity 0 and `pointer-events: none` — the full screen is dedicated to the text

**Given** the user taps the center 60% of the screen
**When** the tap is detected (not the left/right 20% pagination zones)
**Then** `reader.store.toggleChrome()` fires, and the top/bottom bars slide in/out smoothly (CSS transition, no layout reflow of text)

**Given** the very first time a user opens the reader
**When** `ChromelessLayout` mounts and `isChromeVisible` is `true`
**Then** a brief text hint "Chạm vào giữa màn hình để hiện menu" appears, chrome auto-hides after 3 seconds, and the hint is removed from the DOM after the first successful center-tap

**Given** `isChromeVisible` transitions to `true`
**When** the top/bottom bars animate in
**Then** the text content does not reflow or shift — bars overlay the text as a layer

**Given** a screen reader is active
**When** the reader renders
**Then** ARIA landmarks are present: `role="main"` on the reading content area, `role="navigation"` on the top bar, and each "page" of text has `aria-live="polite"` to announce page changes

---

### Story 3.5: Reader Error States & Loading Polish

As a **user**,
I want the reader to handle network errors, missing content, and loading states gracefully,
So that I am never confronted with a confusing blank screen or raw technical error.

**Acceptance Criteria:**

**Given** the app is offline and the requested book JSON is not cached
**When** `useBook(id)` fails with a network error
**Then** `<ReaderErrorPage>` renders with the message "Nội dung này chưa được tải về. Vui lòng kết nối mạng và thử lại." and a single button linking back to Library

**Given** the book JSON is fetched successfully but fails Zod schema validation
**When** `book.schema.safeParse()` returns `success: false`
**Then** `<ReaderErrorPage>` renders with "Nội dung kinh bị lỗi định dạng." — the raw Zod error is never shown to the user

**Given** a book with 0 paragraphs (empty content array)
**When** `ReaderEngine` renders
**Then** a single page with the message "Nội dung trống." is displayed — no crash, no infinite loop

**Given** the font files have not yet loaded when the component mounts
**When** `document.fonts.ready` has not yet resolved
**Then** `<SkeletonText>` continues to display until fonts are ready and pagination completes — the reader never renders with fallback font metrics

---

## Epic 4: Offline Reading & Seamless Continuity

Users can read any previously opened sutra without internet and return to the exact page they left off — automatically, every session.

### Story 4.1: StorageService Layer

As a **developer**,
I want a `StorageService` abstraction over `localforage` with typed constants,
So that all persistence operations go through a single, swappable interface and no component ever touches storage APIs directly.

**Acceptance Criteria:**

**Given** `StorageService` interface in `shared/services/storage.service.ts` with `getItem<T>`, `setItem<T>`, `removeItem`
**When** `LocalforageStorageService` implements this interface
**Then** all methods delegate to `localforage` and resolve as Promises — no synchronous storage calls exist anywhere in the codebase

**Given** `shared/constants/storage.keys.ts` exporting `STORAGE_KEYS` object with `SCREAMING_SNAKE_CASE` constants: `LAST_READ_POSITION`, `USER_SETTINGS`, `BOOKMARKS`
**When** any store or service reads or writes to storage
**Then** it imports a key from `STORAGE_KEYS` — no string literals appear in storage calls

**Given** `shared/hooks/useStorageHydration.ts` called once in `App.tsx`
**When** the app mounts
**Then** it reads `LAST_READ_POSITION`, `USER_SETTINGS`, and `BOOKMARKS` from `StorageService` and dispatches each to the corresponding Zustand store's `hydrate()` action

**Given** `localforage` throws a `QuotaExceededError` during `setItem`
**When** `LocalforageStorageService.setItem()` catches the error
**Then** it logs the error to console and does not crash the app — the UI continues functioning with the in-memory Zustand state

**Given** a Vitest unit test mocking `StorageService`
**When** `useStorageHydration` runs
**Then** each store's `hydrate()` action is called with the correct persisted values

---

### Story 4.2: Reading Progress Persistence & Resume

As a **user**,
I want the app to automatically remember exactly which page I was reading,
So that every time I reopen a sutra I continue from where I left off without any manual bookmarking.

**Acceptance Criteria:**

**Given** the user turns to any page in `ReaderEngine`
**When** `reader.store.setCurrentPage(n)` fires
**Then** within the same tick, `StorageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId, page: n })` is called silently — no UI feedback shown

**Given** the user closes the app and reopens it
**When** `useStorageHydration` runs on mount
**Then** `reader.store.hydrate({ bookId, page })` is called with the persisted values

**Given** `HomePage` renders and `lastReadPosition` exists in `reader.store`
**When** the Home screen loads
**Then** a "Continue Reading" hero card shows the book title and page number (e.g., "Kinh Pháp Hoa — trang 14") as the primary action

**Given** the user taps the "Continue Reading" card
**When** navigation occurs
**Then** they land on `/read/:bookId` and `ReaderEngine` opens directly to the saved page (not page 1)

**Given** no `lastReadPosition` exists (first-ever app open)
**When** `HomePage` renders
**Then** the "Continue Reading" card is not shown and the primary content directs to the Library

**Given** `bookmarks.store.ts` with `hydrate(bookmarks)` action
**When** the user navigates to `/bookmarks`
**Then** `<BookmarksPage>` lists all persisted reading positions as `<BookmarkCard>` entries (book title, page, timestamp), each tappable to navigate to `/read/:bookId` at the saved page

---

### Story 4.3: Full Book-Data Offline Caching

As a **user**,
I want every sutra I open to be available the next time I visit — even without internet,
So that I can read during flights, retreats, or anywhere without a network connection.

**Acceptance Criteria:**

**Given** Workbox `generateSW` config in `vite.config.ts` with a `NetworkFirst` then `CacheFirst` runtime strategy for `/book-data/**`
**When** `useBook(id)` fetches a book JSON for the first time while online
**Then** the SW intercepts the response and caches it under the `book-data` Workbox cache

**Given** the book has been fetched at least once
**When** the user opens the same book while offline
**Then** the SW serves the cached JSON; the reader loads identically to the online experience

**Given** the user opens a book for the first time while offline (never cached)
**When** the SW fetch fails
**Then** `useBook` returns an error and `<ReaderErrorPage>` shows "Nội dung này chưa được tải về."

**Given** a Playwright E2E test that:
1. Loads a book while online
2. Switches to offline (via CDP network interception)
3. Reloads and navigates to the same book
**When** the test runs
**Then** the book content renders without any network requests

**Given** the `<OfflineBanner>` component in `shared/components/`
**When** `useOnlineStatus()` returns `false`
**Then** a subtle, themed banner (matching the active reading theme) appears at the top of the screen: "Đang offline — đọc từ bộ nhớ đệm"

---

### Story 4.4: Background Catalog Sync

As a **user**,
I want the library catalog to update silently in the background when new texts are added,
So that I always have the latest list of available sutras without needing to manually refresh.

**Acceptance Criteria:**

**Given** the user is online and opens the Library
**When** TanStack Query's background refetch detects the SW has a newer version of `index.json`
**Then** `queryClient.invalidateQueries({ queryKey: queryKeys.catalog() })` is called and the catalog re-fetches silently

**Given** the SW detects an updated `index.json` on the server (via `stale-while-revalidate` strategy for the catalog)
**When** the updated response is cached
**Then** the SW sends a `postMessage` to the app; the app calls `queryClient.invalidateQueries` in response

**Given** the catalog updates in the background while the user is reading
**When** the update completes
**Then** no interruption occurs to the active reading session — the update is entirely transparent

**Given** `useOnlineStatus()` returns `false`
**When** the user is offline
**Then** no background sync attempts are made and no network error is shown

---

### Story 4.5: Bookmarks View

As a **user**,
I want to see all my saved reading positions in one place,
So that I can quickly return to any sutra I was reading without searching for it again.

**Acceptance Criteria:**

**Given** the user taps the "Đánh Dấu" tab
**When** `BookmarksPage` renders
**Then** it displays a list of `<BookmarkCard>` components, one per saved position, sorted by most recently read

**Given** `<BookmarkCard>` for a saved position
**When** rendered
**Then** it shows: book title (Lora font), page number, and relative timestamp (e.g., "2 giờ trước"), with a minimum 44×44px tap target

**Given** the user taps a `<BookmarkCard>`
**When** navigation occurs
**Then** they land on `/read/:bookId` and the reader opens at the exact saved page

**Given** no bookmarks exist yet
**When** `BookmarksPage` renders
**Then** an empty state message is shown: "Chưa có đánh dấu nào. Hãy bắt đầu đọc một bản kinh!" with a button to the Library

**Given** `bookmarks.store.ts` in Zustand with `immer` middleware
**When** `setCurrentPage` fires in `reader.store`
**Then** `bookmarks.store.upsertBookmark({ bookId, page, timestamp })` is called — one bookmark per book (upsert, not append)

---

## Epic 5: Reading Personalization

Users can tailor their reading environment with font sizes and visual themes that persist silently across every session.

### Story 5.1: Font Size Control & Pagination Reflow

As a **user**,
I want to increase or decrease the text font size,
So that I can read comfortably regardless of my eyesight or device.

**Acceptance Criteria:**

**Given** `<FontSizeControl>` in `SettingsPage` (Radix UI Slider primitive)
**When** the user drags the slider
**Then** `settings.store.setFontSize(value)` fires with a value between 14px and 28px in 2px increments

**Given** `settings.store.fontSize` changes
**When** `ReaderEngine` re-renders (via `useMemo` dependency on `fontSize`)
**Then** `paginateBook` is called with the new `fontSize`, producing a recalculated `pages[]` array, and the reader resets to page 1 of the new layout

**Given** a font size of 28px (maximum)
**When** the reader renders
**Then** the layout does not break — text remains within the reading column without horizontal overflow

**Given** a font size change
**When** `settings.store.setFontSize` fires
**Then** `StorageService.setItem(STORAGE_KEYS.USER_SETTINGS, { fontSize, theme })` is called silently (no save button required)

**Given** the user reopens the app after setting font size to 24px
**When** `useStorageHydration` runs
**Then** `settings.store.hydrate({ fontSize: 24, theme })` restores the preference before the first render

---

### Story 5.2: Reading Themes — Sepia, Light & Dark

As a **user**,
I want to switch between Sepia, Light, and Dark reading environments,
So that I can read comfortably in any lighting condition.

**Acceptance Criteria:**

**Given** `<ThemeToggle>` in `SettingsPage` with three options: Sepia, Light, Dark
**When** the user selects a theme
**Then** `settings.store.setTheme(theme)` fires and `useTheme` hook sets the corresponding class (`.theme-sepia`, `.theme-light`, or `.theme-dark`) on `document.documentElement`

**Given** a theme class is applied to `<html>`
**When** any component renders
**Then** it inherits the active theme's CSS custom properties (`--color-background`, `--color-text`, `--color-accent`) — no theme classes are applied to child elements directly

**Given** the Dark theme is active
**When** the reader renders
**Then** the background is a deep grey (not pure black) and text is off-white — both meeting WCAG AA 4.5:1 contrast

**Given** the Sepia theme is active (default)
**When** `App.tsx` mounts for the very first time (no stored preference)
**Then** `.theme-sepia` is the default class on `<html>`

**Given** the user switches themes while reading
**When** the theme class changes on `<html>`
**Then** the `ChromelessLayout` overlay bars and `<BottomNav>` update colors immediately — no flash of wrong theme

**Given** a theme change
**When** `settings.store.setTheme` fires
**Then** `StorageService.setItem(STORAGE_KEYS.USER_SETTINGS, { fontSize, theme })` is called silently

---

### Story 5.3: Settings Page & Offline Storage Management

As a **user**,
I want a dedicated settings screen where I can manage my reading preferences and see my offline storage usage,
So that I have full control over my reading experience and can free up device storage if needed.

**Acceptance Criteria:**

**Given** the user taps the "Cài Đặt" tab
**When** `SettingsPage` renders
**Then** it displays: font size slider (`<FontSizeControl>`), theme toggle (`<ThemeToggle>`), and an offline storage section (`<OfflineStorageInfo>`)

**Given** `<OfflineStorageInfo>`
**When** rendered
**Then** it shows the estimated storage used by the `book-data` cache (via `navigator.storage.estimate()`) and a "Xóa bộ nhớ đệm" button

**Given** the user taps "Xóa bộ nhớ đệm"
**When** the action is confirmed
**Then** the Workbox `book-data` cache is cleared, TanStack Query cache is invalidated, and `<OfflineStorageInfo>` updates to show 0 bytes used

**Given** `navigator.storage.estimate()` is unavailable (older browser)
**When** `<OfflineStorageInfo>` renders
**Then** it shows "Không thể đọc dung lượng bộ nhớ" gracefully — no crash, no unhandled promise rejection

**Given** `localforage` throws a `QuotaExceededError` during any storage write
**When** the error is caught by `LocalforageStorageService`
**Then** a subtle, themed in-place message appears in `<OfflineStorageInfo>`: "Bộ nhớ đầy — một số tùy chỉnh không được lưu" — the app continues functioning normally (NFR5)
