---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments: [
  "_bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md",
  "_bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md",
  "docs/ke-hoach-thu-vien-kinh-phat.md"
]
workflowType: 'architecture'
project_name: 'monkai'
user_name: 'Minh'
date: '2026-03-06'
lastStep: 8
status: 'complete'
completedAt: '2026-03-06'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The system provides an offline-capable PWA reading interface for Buddhist sutras. 16 FRs span four domains: catalog discovery (browse by category, global search), the reading experience (paginated page-flip engine, error states), offline/storage management (Service Worker caching, background sync, cross-platform storage persistence, resume from last position), and reader customization (font size, Day/Night/Sepia themes). The defining interaction—discrete paginated text from dynamically calculated viewport chunks—is novel and drives the majority of architectural decisions.

**Non-Functional Requirements:**
- TTI < 2.0s (post-SW cache) on 3G
- Pagination calculation < 100ms for up to 500 paragraphs
- Page turn visual response < 50ms (60fps)
- 100% core features offline
- WCAG AA contrast (min 4.5:1) across all three themes
- Dynamic text scaling up to 200% without layout breakage
- Touch targets minimum 44x44px

**Scale & Complexity:**

- Primary domain: PWA / Static Frontend (React 18 + Vite)
- Complexity level: Medium-High (pagination engine novelty + hybrid-ready abstraction)
- Estimated architectural components: ~8 core modules
- No real-time features, no multi-tenancy, no regulatory compliance, no backend API (MVP)

### Technical Constraints & Dependencies

- **Static hosting only (GitHub Pages):** No server-side logic, no dynamic API. All data is pre-crawled JSON from Phase 1.
- **Brownfield data schema:** Must consume existing Phase 1 `book-data/` JSON structure (id, title, category, subcategory, content as paragraph arrays).
- **Hybrid-ready from day 1:** Storage interfaces, routing, and fetch logic must be abstracted away from browser-native APIs to enable future Capacitor/React Native migration (Phase 4).
- **Phase 3 readiness:** Architecture must support adding a FastAPI + Claude RAG backend (Phase 3) without restructuring the frontend routing or state management.
- **Vietnamese/Pali/Sanskrit typography:** Font choice and fallback stacks are architectural constraints; they affect text measurement in the pagination engine.
- **No CSS-in-JS runtime:** Tailwind utility-first only. No styled-components or emotion (performance budget constraint).

### Cross-Cutting Concerns Identified

1. **Storage abstraction layer** — localStorage/IndexedDB on web, native storage on hybrid. Every stateful feature (bookmarks, settings, progress) routes through this.
2. **Service Worker lifecycle** — Cache-first strategy, background catalog sync, update prompts. Affects every network interaction.
3. **Performance budget** — 60fps page turns + <100ms pagination calc forces pre-calculation strategies and off-thread computation.
4. **Theme system** — 3 reading modes (Sepia/Light/Dark) affect typography rendering, color tokens, and contrast validation globally.
5. **Typography rendering** — Vietnamese diacritics + Pali characters must be validated for every font loaded; affects font loading strategy and pagination measurement.
6. **Phase 3 seam** — Reader components and routing must be designed to accept future dynamic data sources (search API, chat context links) without rewiring.

## Starter Template Evaluation

### Primary Technology Domain

PWA / Static Frontend based on project requirements analysis.
Stack confirmed by PRD: React + TypeScript, Vite, Tailwind CSS, Radix UI, Zustand/Context, React Router v6+, vite-plugin-pwa (Service Worker).

### Starter Options Considered

1. `create-vite` (react-ts) — Official Vite scaffolder. Minimal, no PWA or Tailwind. Would require manual setup of all critical infrastructure.
2. `@vite-pwa/create-pwa` (react-ts) — Official PWA scaffolder from the vite-pwa team. Configures vite-plugin-pwa, Workbox, and Web App Manifest out of the box.
3. Community templates (Vitamin, etc.) — Third-party, variable maintenance quality.

### Selected Starter: @vite-pwa/create-pwa (react-ts)

**Rationale for Selection:**
Service Worker and PWA caching are load-bearing infrastructure for this project — not an optional enhancement. The `@vite-pwa/create-pwa` tool correctly configures Workbox and the manifest, which is the most error-prone setup step. All other dependencies (Tailwind, Radix UI, Zustand, React Router) are standard additions.

**Initialization Command:**

```bash
npm create @vite-pwa/pwa@latest
# Select: react-ts template during interactive wizard
# Then add: tailwindcss, react-router-dom, @radix-ui/*, zustand, localforage
```

**⚠️ Version note:** v1.0.0 targets Vite 7 and may scaffold React 19. Verify React version at init and pin to 18 if needed for team compatibility.

**Architectural Decisions Provided by Starter:**

**Language & Runtime:** TypeScript (strict mode) with React JSX transform.

**Build Tooling:** Vite 7 — HMR in dev, optimized production bundle with tree-shaking.

**PWA Infrastructure:** vite-plugin-pwa pre-configured with:
- Workbox (generateSW or injectManifest strategy)
- Web App Manifest (icons, display: standalone, theme colors)
- Service Worker registration with update flow
- Dev-mode SW support

**Testing Framework:** Not included by default — Vitest + Testing Library added in story 1.

**Code Organization:** Standard Vite project structure (src/, public/, index.html at root). Directory conventions imposed by architecture decisions (see next section).

**Development Experience:** Fast HMR, TypeScript type-checking, Vite dev server. ESLint config included; Prettier added manually.

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Pagination engine strategy (main thread, pre-calculation at load)
- Storage abstraction interface (localforage + StorageService wrapper)
- Service Worker cache strategy (cache-first via vite-plugin-pwa/Workbox)

**Important Decisions (Shape Architecture):**
- State management split: TanStack Query (async) + Zustand (sync)
- Data fetching: TanStack Query v5 with staleTime: Infinity
- Testing stack: Vitest + Testing Library + Playwright

**Deferred Decisions (Post-MVP):**
- Web Worker offloading for pagination (re-evaluate if 100ms budget exceeded)
- Capacitor Storage swap (Phase 4 hybrid migration)
- FastAPI integration (Phase 3)

### Data Architecture

**Data Source:** Static JSON files from Phase 1 `book-data/` hosted on GitHub Pages. No database. No write operations.

**Two-layer caching:**
1. Network layer: Service Worker (Workbox cache-first) — caches raw JSON responses
2. React layer: TanStack Query v5 (`staleTime: Infinity`) — caches parsed JS objects

**TanStack Query v5** (`@tanstack/react-query`, latest: 5.90.21)
- Global `staleTime: Infinity` — no background refetching for static data
- `QueryClient` configured with `gcTime: Infinity` for the session
- Queries: `useCatalogIndex()`, `useBook(id)`, `useCategory(slug)`
- Pairs with Zustand: TanStack Query owns async/server state; Zustand owns sync/client state

**Data validation:** Zod schemas for Phase 1 JSON (guards against schema drift between crawler output and frontend expectations).

### Authentication & Security

No authentication in MVP. No user accounts until Phase 4.

**Static hosting security:**
- Content Security Policy headers via `_headers` file (GitHub Pages / Netlify)
- No secrets in client bundle (all data is public domain Buddhist texts)
- HTTPS enforced by GitHub Pages

### API & Communication Patterns

MVP is entirely static — no API calls to a backend.

**Data access pattern:**
```
Component → TanStack Query hook → fetch() → GitHub Pages JSON → Service Worker cache
```

**Error handling standard:**
- Network errors: TanStack Query `error` state → `<ErrorPage>` component with calm, themed fallback (no raw browser errors shown to user)
- Parse errors: Zod `.safeParse()` → graceful "content unavailable" state
- Offline + uncached: Service Worker returns cached version or offline fallback page

**Phase 3 seam:** Data hooks (`useCatalogIndex`, `useBook`) are abstracted behind a `DataService` interface. Swapping from static fetch to FastAPI calls requires only changing the service implementation, not the hook signatures.

### Frontend Architecture

**State Management:**
- **TanStack Query v5** — async state: catalog index, book content, category lists
- **Zustand** — sync state: current page index, reader settings (theme, font size), bookmark list, `isChromeVisible` toggle
- **localforage** (via StorageService) — persisted state: last read position, user preferences, bookmarks. Hydrated into Zustand on app start.

**Pagination Engine:**
- Strategy: Pre-calculation at book load time (main thread)
- Algorithm: On book open, measure available viewport height (accounting for font size and line height), split paragraph array into `pages: Paragraph[][]` fitting that height
- Storage: Pre-calculated pages array stored in Zustand reader store for the session
- Page turn: Instant Zustand slice access — zero calculation cost, guaranteed <50ms
- Recalculation triggers: Font size change, viewport orientation change
- Fallback: If calculation exceeds 150ms, chunk into background via `requestIdleCallback`

**Component Architecture:**
- `<ReaderEngine>` — pagination logic, tap/swipe zones, page rendering
- `<ChromelessLayout>` — chrome visibility toggle (center tap), top/bottom overlay bars
- `<LibrarySearchHub>` — unified search + category browse (debounced fuzzy search)
- `<BookmarksView>`, `<SettingsView>` — supporting screens

**Routing:** React Router v6 (Data Router)
```
/                    → Home (Continue Reading)
/library             → LibrarySearchHub
/library/:category   → Category book list
/read/:bookId        → ReaderEngine + ChromelessLayout
/bookmarks           → BookmarksView
/settings            → SettingsView
```

**Storage Abstraction:**
```typescript
interface StorageService {
  getItem<T>(key: string): Promise<T | null>
  setItem<T>(key: string, value: T): Promise<void>
  removeItem(key: string): Promise<void>
}
// MVP: LocalforageStorageService
// Phase 4: CapacitorStorageService
```

**Styling:** Tailwind CSS v4 utility classes only. Design tokens in `tailwind.config.ts`: colors (kem, nâu trầm, vàng đất), type scale, spacing. Three reading themes as CSS custom property sets toggled via a class on `<html>`.

### Infrastructure & Deployment

**Hosting:** GitHub Pages (static). Zero cost. `book-data/` JSON served from same repo or linked submodule.

**CI/CD Pipeline (GitHub Actions on `main` push):**
```
lint (ESLint) → typecheck (tsc --noEmit) → unit tests (Vitest) → build (vite build)
→ E2E tests (Playwright, against built output) → deploy (GitHub Pages)
```

**Testing:**
- **Vitest + @testing-library/react** — unit and integration tests (pagination algorithm, storage service, hook behavior)
- **Playwright** — E2E tests (offline flows via service worker interception, page turn interaction, bookmark persistence)

### Decision Impact Analysis

**Implementation Sequence:**
1. Scaffold with `@vite-pwa/create-pwa` (react-ts) → add Tailwind, Zustand, TanStack Query, React Router, localforage, Zod, Vitest, Playwright
2. StorageService interface + LocalforageStorageService
3. Zustand stores (reader, settings, bookmarks)
4. TanStack Query hooks + Zod schemas for Phase 1 JSON
5. Pagination engine (standalone, testable, no React dependency)
6. ReaderEngine + ChromelessLayout components
7. LibrarySearchHub + routing shell
8. Service Worker configuration (Workbox cache strategies)
9. CI/CD pipeline

**Cross-Component Dependencies:**
- Pagination engine depends on: font metrics (theme system), viewport dimensions, Phase 1 JSON paragraph schema
- StorageService is depended on by: Zustand stores (hydration), bookmark features, settings persistence
- TanStack Query cache is depended on by: all data-displaying components
- Service Worker is depended on by: offline guarantee (all network requests)

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified

8 areas where AI agents could make incompatible choices: file/component naming, directory organization, Zustand store structure and action naming, TanStack Query key factory format, TypeScript interface vs type usage, StorageService key naming, error handling approach, and test file placement.

### Naming Patterns

**Files & Components:**
- React components: `PascalCase.tsx` (e.g., `ReaderEngine.tsx`, `LibrarySearchHub.tsx`)
- Hooks: `camelCase.ts` prefixed with `use` (e.g., `useReaderStore.ts`, `useCatalogIndex.ts`)
- Stores: `camelCase.store.ts` (e.g., `reader.store.ts`, `settings.store.ts`)
- Services: `camelCase.service.ts` (e.g., `storage.service.ts`, `data.service.ts`)
- Types/interfaces: `camelCase.types.ts` per feature (e.g., `reader.types.ts`)
- Tests: co-located, `*.test.ts` or `*.test.tsx`
- Zod schemas: `camelCase.schema.ts` (e.g., `book.schema.ts`)

**Code Conventions:**
- TypeScript: prefer `interface` for object shapes that may be extended (e.g., `StorageService`), prefer `type` for unions/computed types
- No `enum` — use `const` objects with `as const` (better TS inference, smaller bundle)
- All function components: named function declarations, not arrow function assignments at module level
- Zustand actions: `set` prefix for setters, `toggle` for booleans (e.g., `setFontSize`, `toggleChrome`, `setCurrentPage`)

**StorageService Keys:**
- Defined in a single `storage.keys.ts` constants file — no string literals scattered through the codebase
- Format: `SCREAMING_SNAKE_CASE` (e.g., `LAST_READ_POSITION`, `USER_SETTINGS`, `BOOKMARKS`)

**TanStack Query Key Factories:**
- All keys defined in a single `query.keys.ts` file using factory pattern:
```typescript
export const queryKeys = {
  catalog: () => ['catalog'] as const,
  book: (id: string) => ['book', id] as const,
  category: (slug: string) => ['category', slug] as const,
}
```
- Never use inline array literals as query keys in components

### Structure Patterns

**Directory Organization: feature-based inside `src/`**

```
src/
  features/
    reader/          ← ReaderEngine, ChromelessLayout, reader.store.ts, reader.types.ts
    library/         ← LibrarySearchHub, category views
    bookmarks/       ← BookmarksView
    settings/        ← SettingsView, settings.store.ts
  shared/
    components/      ← truly shared UI (Button, ErrorPage, SkeletonText)
    hooks/           ← shared hooks (useStorageService, useTheme, useOnlineStatus)
    services/        ← storage.service.ts, data.service.ts
    schemas/         ← book.schema.ts, catalog.schema.ts (Zod)
    constants/       ← query.keys.ts, storage.keys.ts, routes.ts
    types/           ← global TypeScript types
  stores/            ← Zustand store files (one per domain)
  lib/
    pagination/      ← pagination engine (pure TS, no React dependency)
  App.tsx
  main.tsx
```

**Barrel Exports:** `index.ts` at the `features/*` and `shared/*` level only. Never at `src/` root. No barrel re-exports inside `lib/pagination/` (import directly).

**Test Placement:** Co-located with the file under test — `ReaderEngine.test.tsx` next to `ReaderEngine.tsx`, `pagination.test.ts` next to the engine.

### Format Patterns

**Zustand Store Structure (all stores follow this shape):**
```typescript
interface ReaderState {
  // state fields first
  currentPage: number
  isChromeVisible: boolean
  // actions always last
  setCurrentPage: (page: number) => void
  toggleChrome: () => void
  reset: () => void
}
```
- Actions defined inside the store, never outside
- Use Zustand's `immer` middleware for nested state updates — no manual spread chains

**Phase 1 JSON Field Naming:** camelCase in TypeScript interfaces, validated against Zod schemas. If the crawler outputs snake_case, transform at the Zod schema boundary (`.transform()`), not in components.

**Imports:** Absolute paths via `@/` alias (configured in `tsconfig.json` + `vite.config.ts`). Relative imports only within the same feature folder.

### Communication Patterns

**State Management:**
- TanStack Query owns async/server state (catalog, book content, categories)
- Zustand owns sync/client state (page position, theme, bookmarks, chrome visibility)
- localforage (via StorageService) owns persisted state — hydrated into Zustand on app init
- No crossover: components never read persisted state directly from localforage

**Zustand Hydration Pattern:**
```typescript
// In App.tsx or a root-level hook — run once on mount
useEffect(() => {
  storageService.getItem(STORAGE_KEYS.USER_SETTINGS).then(settings => {
    if (settings) useSettingsStore.getState().hydrate(settings)
  })
}, [])
```

### Process Patterns

**Error Handling:**
- No `try/catch` inside React components — errors surfaced via TanStack Query's `error` state or Zod's `safeParse` result
- `try/catch` only in service layer (`storage.service.ts`, `data.service.ts`)
- User-facing errors: always rendered via themed `<ErrorPage message={...} />` — never raw `error.message` exposed to UI

**Loading States:**
- Use TanStack Query's `isLoading` / `isFetching` — no local `useState(false)` loading booleans for data fetching
- Loading UI: `<SkeletonText>` component matching text line height — no generic spinners in the reader flow

**Offline Detection:**
- Single shared `useOnlineStatus()` hook using `navigator.onLine` + event listeners — not replicated per component

**Pagination Engine Calling Convention:**
```typescript
// ALWAYS called in useEffect or useMemo — never in render body
const pages = useMemo(
  () => paginateBook(paragraphs, { viewportHeight, fontSize, lineHeight }),
  [paragraphs, viewportHeight, fontSize, lineHeight]
)
```

**Theme Application:**
- Theme class set on `<html>` element only: `document.documentElement.className = theme`
- Never set theme classes on child elements
- CSS custom properties defined in `index.css` under `.theme-sepia`, `.theme-light`, `.theme-dark`

### Enforcement Guidelines

**All AI agents MUST:**
- Import query keys from `query.keys.ts` — never inline `['book', id]`
- Import storage keys from `storage.keys.ts` — never string literals
- Use the `StorageService` interface — never call `localStorage` or `indexedDB` directly
- Place pagination engine calls in `useEffect` or `useMemo` — never in render body
- Use `@/` absolute imports across feature boundaries
- Validate all Phase 1 JSON at the service layer using Zod — never trust raw fetch responses
- Use `immer` middleware for Zustand stores with nested state

**Pattern Enforcement:**
- ESLint `no-restricted-imports` rule blocks direct `localStorage` and `indexedDB` usage
- ESLint `no-restricted-syntax` rule flags inline TanStack Query key arrays
- TypeScript strict mode catches interface/type misuse at compile time

## Project Structure & Boundaries

### Monorepo Organization

Monkai uses a **clean `apps/` monorepo** with `devbox.json` as the single orchestration layer.

```
monkai/                             ← repo root
├── apps/
│   ├── crawler/                    ← Phase 1: Python crawler (migrated from root via git mv)
│   │   ├── crawler.py
│   │   ├── models.py
│   │   ├── utils/
│   │   ├── config.yaml
│   │   └── pyproject.toml
│   ├── reader/                     ← Phase 2: React PWA (new)
│   │   └── (see full tree below)
│   └── backend/                    ← Phase 3: FastAPI + RAG (future)
├── book-data/                      ← shared JSON data (served via GitHub Pages)
├── docs/
├── devbox.json                     ← devbox run crawl | dev | build | test
├── _bmad-output/
└── .github/
    └── workflows/
        └── ci.yml                  ← path-filtered: changes in apps/reader/ → reader pipeline
```

**Devbox commands:**
```
devbox run crawl   → cd apps/crawler && uv run python crawler.py
devbox run dev     → cd apps/reader && pnpm dev
devbox run build   → cd apps/reader && pnpm build
devbox run test    → cd apps/reader && pnpm test
```

**Migration note:** Phase 1 crawler files (`crawler.py`, `models.py`, `utils/`, `config.yaml`) move to `apps/crawler/` via `git mv` — one-time migration, internal relative imports stay valid.

### Complete Reader App Directory Structure

```
monkai/apps/reader/
├── public/
│   ├── icons/                          ← PWA icons (192x192, 512x512, maskable)
│   ├── offline.html                    ← Offline fallback page (themed)
│   └── _headers                        ← CSP headers for GitHub Pages / Netlify
├── e2e/                                ← Playwright E2E tests
│   ├── reader.spec.ts                  ← page turn, offline reading flows
│   ├── library.spec.ts                 ← search, category browse
│   └── pwa.spec.ts                     ← SW install, offline fallback
├── src/
│   ├── main.tsx                        ← entry: QueryClient, Router, SW registration
│   ├── App.tsx                         ← routing shell, theme init, storage hydration
│   ├── index.css                       ← Tailwind base + .theme-sepia/.theme-light/.theme-dark
│   │
│   ├── features/
│   │   ├── home/
│   │   │   ├── HomePage.tsx            ← FR13: "Continue Reading" hero + nav shell
│   │   │   ├── ContinueReadingCard.tsx
│   │   │   └── home.types.ts
│   │   ├── reader/
│   │   │   ├── ReaderPage.tsx          ← FR5: route /read/:bookId
│   │   │   ├── ReaderEngine.tsx        ← FR6, FR7: pagination, tap/swipe zones
│   │   │   ├── ChromelessLayout.tsx    ← chrome toggle (center tap), overlay bars
│   │   │   ├── PageProgress.tsx        ← progress indicator (e.g. 14/89)
│   │   │   ├── ReaderErrorPage.tsx     ← FR8: graceful themed error state
│   │   │   ├── reader.store.ts         ← currentPage, isChromeVisible, pages[]
│   │   │   ├── reader.types.ts
│   │   │   └── ReaderEngine.test.tsx
│   │   ├── library/
│   │   │   ├── LibraryPage.tsx         ← FR1, FR2, FR3: unified search + browse
│   │   │   ├── LibrarySearchHub.tsx    ← FR3, FR4: debounced search + category grid
│   │   │   ├── CategoryPage.tsx        ← FR2: sutra list for a category
│   │   │   ├── SutraListCard.tsx       ← individual book entry card
│   │   │   ├── SearchResults.tsx       ← FR4: instant filtered results
│   │   │   └── library.types.ts
│   │   ├── bookmarks/
│   │   │   ├── BookmarksPage.tsx       ← FR13: saved reading positions
│   │   │   ├── BookmarkCard.tsx
│   │   │   └── bookmarks.types.ts
│   │   └── settings/
│   │       ├── SettingsPage.tsx        ← FR14, FR15, FR16
│   │       ├── FontSizeControl.tsx     ← FR14: size slider
│   │       ├── ThemeToggle.tsx         ← FR15: Sepia / Light / Dark
│   │       ├── OfflineStorageInfo.tsx  ← FR9: cache usage + clear cache
│   │       └── settings.store.ts      ← (re-exported from stores/)
│   │
│   ├── shared/
│   │   ├── components/
│   │   │   ├── BottomNav.tsx           ← 4-tab navigation shell
│   │   │   ├── ErrorPage.tsx           ← FR8: themed, calm error display
│   │   │   ├── SkeletonText.tsx        ← loading state (matches text line-height)
│   │   │   └── OfflineBanner.tsx       ← subtle offline status indicator
│   │   ├── hooks/
│   │   │   ├── useOnlineStatus.ts      ← navigator.onLine + online/offline events
│   │   │   ├── useTheme.ts             ← reads settings store, applies class to <html>
│   │   │   └── useStorageHydration.ts  ← hydrates Zustand stores on mount
│   │   ├── services/
│   │   │   ├── storage.service.ts      ← StorageService interface + LocalforageStorageService
│   │   │   └── data.service.ts         ← DataService interface + StaticJsonDataService
│   │   ├── schemas/
│   │   │   ├── book.schema.ts          ← Zod: Phase 1 book JSON validation + transform
│   │   │   └── catalog.schema.ts       ← Zod: index.json catalog validation
│   │   ├── constants/
│   │   │   ├── query.keys.ts           ← TanStack Query key factories
│   │   │   ├── storage.keys.ts         ← SCREAMING_SNAKE_CASE storage constants
│   │   │   └── routes.ts               ← route path constants
│   │   └── types/
│   │       └── global.types.ts         ← shared TypeScript types
│   │
│   ├── stores/
│   │   ├── reader.store.ts             ← Zustand: currentPage, isChromeVisible, pages[]
│   │   ├── settings.store.ts           ← Zustand: theme, fontSize (+ hydrate action)
│   │   └── bookmarks.store.ts          ← Zustand: bookmarks list (+ hydrate action)
│   │
│   └── lib/
│       └── pagination/
│           ├── paginateBook.ts         ← pure TS: paragraph[] → pages[][] (no React/DOM)
│           ├── paginateBook.test.ts    ← unit tests: 500 paragraphs < 100ms
│           └── pagination.types.ts     ← PaginationOptions, PaginationResult
│
├── index.html
├── vite.config.ts                      ← vite-plugin-pwa, @/ alias, build config
├── tailwind.config.ts                  ← design tokens (kem, nâu trầm, vàng đất, type scale)
├── tsconfig.json                       ← strict mode, @/ path alias
├── tsconfig.node.json
├── playwright.config.ts
├── vitest.config.ts
├── package.json
├── .eslintrc.cjs                       ← no-restricted-imports (localStorage, indexedDB)
├── .prettierrc
└── .gitignore
```

### Architectural Boundaries

**Data Layer Boundary:**
- `DataService` interface (`shared/services/data.service.ts`) is the single seam
- MVP: `StaticJsonDataService` — fetch from GitHub Pages → Zod validate → return
- Phase 3: swap to `ApiDataService` — calls FastAPI endpoints, same interface, zero component changes
- Zod schemas (`shared/schemas/`) are the contract — all data crossing this boundary is validated

**Storage Boundary:**
- `StorageService` interface is the only storage access point
- Nothing outside `shared/services/` and `stores/` may access storage directly
- Phase 4: swap `LocalforageStorageService` → `CapacitorStorageService` behind the interface

**Pagination Boundary:**
- `lib/pagination/` is pure TypeScript — zero React, zero DOM, zero Zustand dependencies
- Input only: `paragraphs: string[]`, `options: PaginationOptions`
- Output only: `pages: string[][]`
- Consumed exclusively via `useMemo` in `ReaderEngine.tsx`

**Feature Boundaries:**
- Features communicate only through Zustand stores and React Router `<Link>` / `useNavigate`
- No cross-feature component imports (use `shared/components/` for truly shared UI)
- Each feature owns its local types; global types live in `shared/types/`

### Requirements to Structure Mapping

| FR | Requirement | Primary File(s) |
|----|-------------|-----------------|
| FR1 | Browse by category | `features/library/LibraryPage.tsx`, `CategoryPage.tsx` |
| FR2 | List sutras in category | `features/library/CategoryPage.tsx`, `SutraListCard.tsx` |
| FR3 | Search by title/keyword | `features/library/LibrarySearchHub.tsx` |
| FR4 | Instant search results | `SearchResults.tsx` + `catalog.schema.ts` + TanStack Query |
| FR5 | Open and read sutra | `features/reader/ReaderPage.tsx` |
| FR6 | Page-flip navigation | `features/reader/ReaderEngine.tsx` |
| FR7 | Dynamic pagination | `lib/pagination/paginateBook.ts` via ReaderEngine |
| FR8 | Error states | `features/reader/ReaderErrorPage.tsx`, `shared/components/ErrorPage.tsx` |
| FR9 | Offline access | Workbox SW config in `vite.config.ts`, `public/offline.html` |
| FR10 | Auto cache on first visit | vite-plugin-pwa `generateSW` strategy in `vite.config.ts` |
| FR11 | Background catalog update | SW background sync + TanStack Query `invalidateQueries` |
| FR12 | Cross-platform storage | `shared/services/storage.service.ts` (StorageService interface) |
| FR13 | Resume last position | `stores/reader.store.ts` + `shared/hooks/useStorageHydration.ts` |
| FR14 | Font size control | `features/settings/FontSizeControl.tsx` + `stores/settings.store.ts` |
| FR15 | Reading themes | `features/settings/ThemeToggle.tsx` + `shared/hooks/useTheme.ts` |
| FR16 | Persistent preferences | `stores/settings.store.ts` + `StorageService` |

### Data Flow

```
1. App init:
   useStorageHydration → localforage → hydrate Zustand stores (settings, bookmarks, lastRead)

2. Catalog fetch:
   useCatalogIndex() [TanStack Query]
     → DataService.getCatalog()
     → fetch /book-data/index.json
     → catalog.schema.ts (Zod validate)
     → cached in QueryClient (staleTime: Infinity)

3. Book open:
   useBook(id) [TanStack Query]
     → DataService.getBook(id)
     → fetch /book-data/{id}.json
     → book.schema.ts (Zod validate + transform)
     → cached in QueryClient

4. Pagination (on book load):
   useMemo(() => paginateBook(book.paragraphs, { viewportHeight, fontSize, lineHeight }))
     → pages[] stored in reader.store (Zustand)

5. Page turn:
   reader.store.setCurrentPage(n)
     → StorageService.setItem(LAST_READ_POSITION, { bookId, page: n }) [silent]

6. Settings change:
   settings.store.setFontSize(n)
     → StorageService.setItem(USER_SETTINGS, settings) [silent]
     → useTheme applies CSS custom property to <html>
     → ReaderEngine recalculates pagination (useMemo dependency)
```

### Development & Deployment

**Dev:** `devbox run dev` → Vite HMR at `localhost:5173`, SW disabled in dev by default.
Vite proxies `/book-data/` to `../../book-data/` (repo root) during local development.

**Build:** `vite build` → `apps/reader/dist/` — code-split by route (React Router lazy loading)

**Deploy:** GitHub Actions on push to `main` (path filter: `apps/reader/**`) → build → deploy `dist/` to GitHub Pages

**book-data in production:** `book-data/` served from GitHub Pages at the same origin as the reader app.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All choices are compatible. React + Vite + TypeScript, TanStack Query v5 + Zustand, vite-plugin-pwa + React Router, localforage + Zustand hydration, Zod + TypeScript strict, Vitest + Playwright — no conflicts.

**Tailwind Version Pinned:** Tailwind v3 (`^3.4.x`). Tailwind v4 uses a CSS-first config that breaks `tailwind.config.ts`. Pinning v3 ensures ecosystem compatibility with Radix UI examples and established tooling.

**Pattern Consistency:** Feature-based directory, Zustand immer, co-located tests, Zod boundary validation — all align with the chosen stack.

### Requirements Coverage Validation ✅

All 16 FRs mapped to specific files. NFR coverage:

| NFR | Architectural Support |
|-----|----------------------|
| TTI < 2s | SW cache-first + Vite code splitting + lazy routes |
| Pagination < 100ms | Pre-calculation at load, memoized array |
| Page turn < 50ms | Instant Zustand array slice, zero calculation |
| 100% offline | Workbox cache-first + `public/offline.html` |
| WCAG AA contrast | 3 validated design token themes |
| 200% text scaling | CSS `rem` units + pagination recalculates on font change |
| 44px touch targets | Design system enforcement |
| Storage quota error | `<OfflineStorageInfo>` graceful error state |

### Gap Analysis & Resolutions

**Gap 1 — Base URL + Data Source: RESOLVED**

Both the app base path and book-data location are environment-variable driven:

```
# .env (defaults — served at root, no mock server)
VITE_BASE_PATH=/
VITE_BOOK_DATA_URL=

# .env.production (GitHub Pages subpath example)
VITE_BASE_PATH=/monkai/
VITE_BOOK_DATA_URL=

# .env.development (local mock server)
VITE_BASE_PATH=/
VITE_BOOK_DATA_URL=http://localhost:3001
```

`vite.config.ts`:
```typescript
base: process.env.VITE_BASE_PATH ?? '/'
// server.proxy: { '/book-data': process.env.VITE_BOOK_DATA_URL } when set
```

`App.tsx`:
```typescript
<BrowserRouter basename={import.meta.env.VITE_BASE_PATH ?? '/'}>
```

**Mock server** (`apps/reader/scripts/mock-server.mjs`):
- Zero dependencies — Node built-in `http` + `fs`
- Serves `../../book-data/` as static JSON on `http://localhost:3001`
- CORS headers included for local Vite dev server
- `devbox run dev` → `concurrently "node scripts/mock-server.mjs" "vite"`

**Gap 2 — Tailwind version: RESOLVED**
Pin `tailwindcss@^3.4.x` in `package.json`. Config lives in `tailwind.config.ts` (v3 format).

**Gap 3 — Client-side search library: RESOLVED**
**MiniSearch** (`minisearch@^7.x`, ~7kb gzipped).
- Better Vietnamese tokenization than Fuse.js
- Supports field boosting (title > category > author)
- Index built once from `useCatalogIndex()` result, stored in `useMemo`
- Lives in `features/library/LibrarySearchHub.tsx`

**Gap 4 — Font loading strategy: RESOLVED**
- **Self-hosted fonts** in `public/fonts/`: Lora (sutra text), Inter (UI navigation)
- Declared in `index.css` with `font-display: block` for Lora — ensures pagination measures real font metrics, not fallback glyphs
- `ReaderEngine` gates pagination behind `document.fonts.ready`:
```typescript
useEffect(() => {
  document.fonts.ready.then(() => {
    const pages = paginateBook(paragraphs, { viewportHeight, fontSize, lineHeight })
    readerStore.setPages(pages)
  })
}, [paragraphs, viewportHeight, fontSize])
```

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Medium-High)
- [x] Technical constraints identified (static hosting, hybrid-ready, Phase 3 seam)
- [x] Cross-cutting concerns mapped (6 identified)

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined (DataService, StorageService interfaces)
- [x] Performance considerations addressed (pagination strategy, two-layer cache)

**✅ Implementation Patterns**
- [x] Naming conventions established (8 conflict points addressed)
- [x] Structure patterns defined (feature-based, co-located tests)
- [x] Communication patterns specified (Zustand + TanStack Query split)
- [x] Process patterns documented (error handling, loading states, offline)

**✅ Project Structure**
- [x] Complete monorepo structure defined (apps/ layout)
- [x] Reader app directory fully specified (every file named)
- [x] All 16 FRs mapped to specific files
- [x] Architectural boundaries clearly defined (data, storage, pagination, feature)

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level: High**

**Key Strengths:**
- Pagination engine is architecturally isolated — can be built and tested independently
- StorageService and DataService interfaces create clean Phase 3/4 upgrade seams
- All 16 FRs have explicit file mappings — no ambiguity for AI agents
- Performance budget is met architecturally before a line of code is written
- Mock server + env vars enable full local development without GitHub Pages dependency

**Areas for Future Enhancement:**
- Web Worker offloading for pagination if 100ms budget is exceeded on low-end devices
- MiniSearch index persistence (cache built index in localforage to skip rebuild on reload)
- Capacitor Storage swap for Phase 4 hybrid migration (interface already in place)
- FastAPI DataService implementation for Phase 3 (interface already in place)

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently — refer to `query.keys.ts`, `storage.keys.ts`
- Respect feature boundaries — no cross-feature imports except via `shared/`
- Refer to this document for all architectural questions

**First Implementation Story — Scaffold Command:**
```bash
npm create @vite-pwa/pwa@latest
# Select: react-ts template
# cd apps/reader
# Pin and add all dependencies:
# tailwindcss@^3.4.x react-router-dom zustand @tanstack/react-query
# localforage zod minisearch @radix-ui/react-slider @radix-ui/react-dialog
# vitest @testing-library/react playwright concurrently
```
