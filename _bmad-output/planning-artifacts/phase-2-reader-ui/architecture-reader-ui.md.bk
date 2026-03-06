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
date: '2026-03-06T11:04:43+07:00'
lastStep: 8
status: 'complete'
completedAt: '2026-03-06T11:56:46+07:00'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The system must provide an offline-capable, paginated reading interface for Buddhist sutras. It requires local discovery via a pre-loaded index, persistence of reading progress and user preferences (font size, themes), and must rely purely on a statically hosted JSON catalog. Architecturally, this necessitates a robust client-side routing, specialized pagination algorithms, and state management system independent of any backend API.

**Non-Functional Requirements:**
Architecture decisions will be heavily driven by strict performance constraints: Time to Interactive (TTI) < 2 seconds, sub-100ms pagination calculations, and 60fps interaction responses. Absolute offline reliability (100% core features available) and strict WCAG AA accessibility standards are also mandatory.

**Scale & Complexity:**
The project scale is highly focused but technically sophisticated on the client side.

- Primary domain: Progressive Web App / Static Frontend
- Complexity level: Medium
- Estimated architectural components: 4-6 core modules (e.g., Reader Engine, Sync/Storage Engine, Search/Index Manager, Theming/Preferences, Navigation Shell).

### Technical Constraints & Dependencies

- Entirely decoupled from a backend API; fetching static JSON files directly from hosting (e.g. GitHub Pages).
- Must use abstracted storage mechanisms (IndexedDB/localforage) to support future Hybrid Mobile/Capacitor expansion.
- Client-side pagination must not freeze the main UI thread during page reflow calculations.

### Cross-Cutting Concerns Identified

- **State Persistence & Offline Cache:** Managing synchronization between Service Workers, IndexedDB, and the application's React state.
- **Performance & Rendering:** Ensuring the custom `<ReaderEngine>` can parse JSON and render pages instantly without layout thrashing.
- **Accessibility & Theming:** Centralized control over fluid typography scales, font selection, and color themes (Sepia, Light, Dark) across all views.
- **Chromeless UI State:** Managing global UI visibility state seamlessly based on user reading interactions without causing jitter.

## Starter Template Evaluation

### Primary Technology Domain

Web Application (Progressive Web App / Static Frontend) based on project requirements analysis.

### Starter Options Considered

1. **Official Vite + React Setup (Manual Tailwind & PWA integration)**
   - **Pros:** Maximum control, perfectly clean slate, uses the absolute latest versions (Vite 6, React 19, Tailwind v4).
   - **Cons:** Requires manual setup of `vite-plugin-pwa`, Tailwind CSS v4, routing, and state management.

2. **@horizon-labs/vite-react-tailwind-boilerplate**
   - **Pros:** Forward-looking (React 19, Tailwind v4), includes ShadCN UI (excellent for accessible, unstyled primitives), React Router v7, ESLint, and Prettier.
   - **Cons:** Includes ShadCN which might bring in some opinionated structure, though it aligns well with the "Custom Design System using Tailwind CSS and Unstyled Accessible Primitives (e.g., Radix UI)" requirement from the UX spec.

3. **jvidalv/vital (Vital @ Vite Template)**
   - **Pros:** Integrates React 19, TypeScript, Tailwind v4, ESLint 9, Prettier 3, and forces an Atomic Design pattern.
   - **Cons:** Atomic Design might be overkill for the highly specialized `<ReaderEngine>` and specific component strategy outlined in the UX spec.

### Selected Starter: Official Vite + React Setup (with manual Tailwind v4 & PWA integration)

**Rationale for Selection:**
The UX specification strictly mandates a "Custom Design System using Tailwind CSS and Unstyled Accessible Primitives (e.g., Radix UI)" and highlights that the "paginated reader engine is highly custom and not supported by standard UI libraries." It also stresses minimal CSS payloads for 60fps performance. 

While boilerplates like `@horizon-labs` offer Radix/ShadCN pre-configured, the absolute demand for a specialized `<ReaderEngine>` and "Chromeless Default" means we benefit most from a pristine Vite+React foundation. We will manually scaffold Tailwind CSS v4 (for the CSS-first, zero-config approach suitable for our custom color palette of Kem, Nâu trầm, Vàng đất) and `vite-plugin-pwa` to guarantee the offline-first Service Worker is configured exactly to our "Cache-First" needs for the static JSON catalog, without fighting boilerplate cruft.

**Initialization Command:**

```bash
npm create vite@latest monkai-reader -- --template react
# Followed by:
# npm install tailwindcss @tailwindcss/vite
# npm install vite-plugin-pwa -D
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
React 18/19 with Javascript/JSX (or TypeScript if preferred, though PRD doesn't explicitly mandate TS, Vite defaults offer it cleanly).

**Styling Solution:**
Tailwind CSS v4 integrated via `@tailwindcss/vite` plugin for utility-first, purged CSS architecture ensuring minimal bundle size for the critical `<ReaderEngine>`.

**Build Tooling:**
Vite for ultra-fast Hot Module Replacement (HMR) during development and highly optimized Rollup builds for production. `vite-plugin-pwa` handles Service Worker generation for offline caching.

**Testing Framework:**
None pre-configured. We will need to decide on Vitest + React Testing Library later if automated UI testing is required.

**Code Organization:**
Minimalist `src` directory. We will implement the specific structure defined in the UX Spec (e.g., `<ReaderEngine>`, `<ChromelessLayout>`, `<LibrarySearchHub>`).

**Development Experience:**
Instant server start via Vite.

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Storage mechanism for offline state and large JSON handling (IndexedDB vs wrappers).
- Client-side pagination algorithm approach.

**Important Decisions (Shape Architecture):**
- State Management (Zustand vs Context).
- Routing (React Router).

**Deferred Decisions (Post-MVP):**
- User Accounts / Auth.
- Backend RAG integration (Phase 3).
- Hybrid Mobile wrapper (Capacitor/React Native).

### Data Architecture

- **Decision:** Dexie.js for IndexedDB abstraction.
- **Version:** Latest stable (v4.x)
- **Rationale:** The PRD demands robust offline storage (`IndexedDB`) to persist user settings, bookmarks, and potentially cache large structured JSON catalogs. Direct `IndexedDB` API is too verbose and error-prone for React. `localforage` is simpler but lacks the ORM-like querying capabilities needed if we eventually want to query the book catalogs locally. Dexie provides a clean, promise-based API with excellent React integration (`liveQuery`) and schema management, perfect for our scale.
- **Affects:** `<SyncStorageEngine>`, User Preferences, Bookmarks.
- **Provided by Starter:** No.

### Frontend Architecture

- **State Management Decision:** Zustand.
- **Version:** Latest stable (v5.x)
- **Rationale:** We need to manage global UI state (like `isChromeVisible` for the reading experience) and user preferences. React Context can cause unnecessary re-renders when managing frequently changing state or complex objects. Zustand is extremely lightweight, hooks-based, and prevents unnecessary renders, making it ideal for maintaining the strict 60fps performance required by the pagination engine.
- **Affects:** Global UI state, `<ChromelessLayout>`.
- **Provided by Starter:** No.

- **Routing Decision:** React Router.
- **Version:** Latest stable (v7.x)
- **Rationale:** Standard, robust client-side routing. Essential for navigating between the 'Trang Chủ', 'Thư Viện', and specific sutra 'Reader' views without page reloads, maintaining the SPA PWA experience.
- **Affects:** App shell, Navigation.
- **Provided by Starter:** No.

- **Component & Styling Decision:** Tailwind CSS v4 + Radix UI Primitives.
- **Version:** Tailwind v4, Radix UI latest.
- **Rationale:** Decided during the Starter Template phase and strictly mandated by the UX Spec to build the custom `<ReaderEngine>` and achieve the "Chromeless Default" aesthetic with minimal CSS payload.
- **Affects:** All UI components.
- **Provided by Starter:** Tailwind (Yes, via Vite setup), Radix (No).

### Infrastructure & Deployment

- **Hosting Decision:** GitHub Pages (Static Hosting).
- **Rationale:** Mandated by the PRD for the brownfield Phase 1 integration. The React Vite app will be built into static assets and deployed alongside the `book-data` JSON files.
- **Affects:** Build pipeline, Route configuration (basename).
- **Provided by Starter:** N/A (requires GitHub Actions setup).

### Decision Impact Analysis

**Implementation Sequence:**
1. Scaffold Vite+React project with Tailwind v4 and `vite-plugin-pwa` (as defined in Starter Evaluation).
2. Setup GitHub Actions for GitHub Pages deployment.
3. Configure Zustand for global state (`isChromeVisible`, `theme`, `fontSize`).
4. Implement Dexie.js schema for `Bookmarks` and `Preferences`.
5. Build the core `<ReaderEngine>` using the Tailwind palette.

**Cross-Component Dependencies:**
- The `<ReaderEngine>` heavily depends on Zustand for reading the current `fontSize` and `theme` to calculate accurate pagination.
- The `<ChromelessLayout>` depends on Zustand's `isChromeVisible` state to hide/show navigation.
- Disconnecting from the network must seamlessly fall back to Dexie.js/Cache API without breaking the React Router state.

### Addressing Hybrid App Migration (Capacitor/Ionic vs React Native)

A critical question arose regarding whether Dexie.js (and IndexedDB) will continue to work if the PWA is migrated to a Hybrid App architecture (like Ionic/Capacitor or React Native) for iOS/Android stores in the future. 

Here is the architectural reality:

**If migrating to Ionic / Capacitor (Web View based):**
- **Yes, it works.** Capacitor apps run your React code inside a native Web View (WKWebView on iOS, Chrome WebView on Android). These Web Views natively support IndexedDB, and therefore Dexie.js will run without any code changes.
- **The Risk:** Mobile operating systems (especially iOS) have a known behavior of aggressively clearing Web View storage (including IndexedDB) if the device runs extremely low on disk space. While rare, it means IndexedDB in a Capacitor app is technically "volatile" compared to true native storage. 
- **The Solution:** If this risk is unacceptable for production, the standard Capacitor pattern is to swap Dexie.js for `@capacitor-community/sqlite`, which bridges your React app to the device's actual native SQLite database, making it 100% permanent. This would require rewriting the storage layer.

**If migrating to React Native (Native rendering):**
- **No, it does NOT work natively.** React Native does *not* use a Web View; it executes JavaScript but renders native UI components. It does not have a browser DOM or browser APIs like IndexedDB.
- **The Reality:** You cannot use Dexie.js directly in React Native. 
- **The Solution:** You would need to use a React Native specific storage solution like:
    - **WatermelonDB** (Highly recommended for React Native, built on SQLite, reactive like Dexie).
    - **Realm**.
    - **AsyncStorage** (too simple for our needs, equivalent to localForage).

**Architectural Decision & Mitigation:**
Because the primary goal *right now* is a highly performant PWA (Web), Dexie.js is still the correct choice. However, to protect the future Hybrid migration path, we must enforce a **Storage Abstraction Pattern**:

- We will **not** call Dexie.js directly inside our React components. 
- We will create an interface: `StorageEngine.ts`.
- `StorageEngine.ts` will implement methods like `getBookmarks()`, `saveProgress()`, `searchCatalog()`.
- For Phase 2 (PWA), `StorageEngine.ts` will simply call Dexie.js under the hood.
- If/When we migrate to React Native in the future, we only have to rewrite the *inside* of `StorageEngine.ts` to use WatermelonDB or SQLite, without touching a single line of our UI components or Reader Engine.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
5 areas where AI agents could make different choices (Database/Storage Naming, Component Naming, File Structure, State Management Updates, and Error Handling).

### Naming Patterns

**Database/Storage Naming Conventions (Dexie.js):**
- **Store names:** PLURAL, camelCase (e.g., `bookmarks`, `userPreferences`).
- **Primary Keys:** Always explicitly named `id` (usually auto-incremented or UUID strings).
- **Foreign Keys:** Use the singular entity name followed by `Id` (e.g., `sutraId`).
- *Example:* `db.version(1).stores({ bookmarks: '++id, sutraId, paragraphIndex' })`

**API/Data Naming Conventions (JSON Index):**
- **JSON field naming:** EXACTLY match the Phase 1 crawler output, which is `snake_case` (e.g., `key_concepts`, `related_suttas`).
- *Warning:* Agents MUST NOT attempt to map `snake_case` JSON from the network to `camelCase` in memory unless explicitly passing through a defined data adapter, to prevent silent undefined errors.

**Code Naming Conventions (React/Vite):**
- **Components:** PascalCase (e.g., `ReaderEngine.tsx`, `SutraCard.tsx`).
- **Hooks:** camelCase prefixed with `use` (e.g., `usePagination.ts`).
- **Utility Functions:** camelCase (e.g., `calculatePageBreaks.ts`).
- **CSS Classes (Tailwind):** Follow strict Tailwind utility naming. Avoid `@apply` in CSS files unless creating a highly reusable, complex component primitive.

### Structure Patterns

**Project Organization:**
- Feature-based architecture inside `src/`.
- `src/features/` - Contains domain-specific modules (e.g., `features/reader/`, `features/library/`). Each feature folder contains its own `components/`, `hooks/`, and `utils/`.
- `src/components/ui/` - Contains highly reusable, generic UI primitives (buttons, modals).
- `src/store/` - Global Zustand stores.
- `src/services/` - The Storage Abstraction layer (e.g., `StorageService.ts` wrapping Dexie).

**File Structure Patterns:**
- One component per file.
- File names MUST exactly match the primary export name (e.g., `export const ReaderEngine` lives in `ReaderEngine.tsx`).
- Use `.tsx` strictly for React components and `.ts` for pure logic.

### Format Patterns

**Data Exchange Formats:**
- **Boolean variables:** Should always be prefixed with `is`, `has`, or `should` (e.g., `isChromeVisible`, `hasBookmarks`).
- **Null handling:** Always prefer `null` over `undefined` when explicitly clearing a value in Zustand or Dexie database records.

### Communication Patterns

**State Management Patterns (Zustand):**
- **Store separation:** Create separate slices/stores for logically distinct data (e.g., `useReaderStore` for font size/theme, `useUIStore` for `isChromeVisible`).
- **Actions:** Actions modifying state MUST be co-located inside the Zustand store definition, not scattered in components.
- *Example:* `useUIStore.getState().toggleChrome()` instead of `set({ isChromeVisible: !isChromeVisible })` directly inside a React component's `onClick`.

### Process Patterns

**Error Handling Patterns:**
- **Silent Failures (Offline):** Never crash the app if an offline JSON fetch fails. Catch the error and render a beautiful, thematically appropriate fallback component (e.g., `<OfflineFallback />`).
- **Storage Quota Errors:** If Dexie throws a `QuotaExceededError`, agents must catch it and dispatch a specific UI toast notifying the user to clear space, rather than failing silently.

**Loading State Patterns:**
- **Local vs Global:** Avoid blocking the entire app with a global spinner. Use local Skeleton components (e.g., `<SutraSkeleton />`) that match the dimensions of the expected content while JSON is being fetched and parsed into memory.

### Enforcement Guidelines

**All AI Agents MUST:**
- Write ALL components as functional components using React Hooks (no Class components).
- Assume the app is OFFLINE first. All generic data fetching must first check the local Service Worker cache or Dexie database before attempting a network request.
- Use the Storage Abstraction Pattern (`StorageService.ts`) for all data persistence; NEVER import `dexie` directly into a `.tsx` component file.

**Pattern Enforcement:**
- Any agent generating a component that directly imports `dexie` is violating the architecture and must be corrected.
- Any agent using vertical scrolling for the core sutra text instead of the paginated `<ReaderEngine>` logic is violating the UX specification.

### Pattern Examples

**Good Examples:**
```tsx
// Correct: Abstracted storage call inside a component
import { StorageService } from '@/services/StorageService';

const handleBookmark = async (sutraId, paragraphIndex) => {
  await StorageService.saveBookmark({ sutraId, paragraphIndex });
};
```

**Anti-Patterns:**
```tsx
// WRONG: Directly querying Dexie in a component
import { db } from '@/lib/db'; // Violates abstraction pattern

const verses = await db.bookmarks.where('sutraId').equals(id).toArray();
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
monkai-reader/
├── package.json
├── package-lock.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy.yml
├── public/
│   ├── pwa-assets/
│   └── mock-data/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── vite-env.d.ts
│   ├── components/
│   │   ├── ui/
│   │   └── layout/
│   ├── features/
│   │   ├── reader/
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   ├── library/
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   ├── bookmarks/
│   │   │   └── components/
│   │   └── settings/
│   │       └── components/
│   ├── lib/
│   │   └── utils.ts
│   ├── store/
│   │   ├── useReaderStore.ts
│   │   └── useUIStore.ts
│   ├── services/
│   │   ├── StorageService.ts
│   │   └── db.ts
│   ├── types/
│   │   └── index.ts
│   └── hooks/
└── tests/
    ├── e2e/
    └── unit/
```

### Architectural Boundaries

**API Boundaries:**
Phase 2 relies entirely on static JSON files hosted alongside the React app. Core boundary is the network fetch to `book-data/*.json`.
- Entry point for data fetching: Service Worker (Cache-First strategy) -> `fetch()`. No direct backend API calls.

**Component Boundaries:**
- UI Primitives (`src/components/ui/`) NEVER import from `src/features/` or `src/store/`. They accept props and emit events via callbacks.
- Layout Components (`src/components/layout/`) can read from global store (e.g., `useUIStore.getState().isChromeVisible`).
- Feature Components (`src/features/`) contain all business logic and can import services, stores, and UI primitives.

**Service Boundaries:**
- Only `StorageService.ts` is allowed to instantiate and interact with Dexie.js (`db.ts`).
- Service layer methods must return standard Promises resolving to plain JavaScript objects or arrays, abstracting away any Dexie-specific formats (like Table or Collection objects).

**Data Boundaries:**
- The React application state represents the "Display" data.
- The Dexie IndexedDB represents "Persistent User Data" (Bookmarks, settings).
- The Service Worker cache represents "Persistent Library Data" (JSON Catalogs, Sutras).

### Requirements to Structure Mapping

**Feature/Epic Mapping:**
**Reader UI & Pagination Engine:**
- Components: `src/features/reader/components/`
- Hooks: `src/features/reader/hooks/usePagination.ts`
- State: `src/store/useReaderStore.ts`

**Library Discovery & Search:**
- Components: `src/features/library/components/`
- Data Fetching: `src/hooks/useCatalogSearch.ts`

**Bookmarks & Context Preservation:**
- Components: `src/features/bookmarks/components/`
- Storage: `src/services/StorageService.ts` -> `db.bookmarks`

**Cross-Cutting Concerns:**
**Theming & Font Sizing (Accessibility):**
- Centralized in `src/store/useReaderStore.ts` and `src/index.css` (Tailwind variables).

### File Organization Patterns

**Source Organization:**
Code is organized by **Feature Module** (`src/features/*`), preferring co-location of components and hooks that belong to specific domains. Shared utilities and dumb components go to `src/components/ui/` and `src/lib/`.

**Test Organization:**
- Unit Tests: Co-located with the implementation file (e.g., `usePagination.test.ts` next to `usePagination.ts`).
- E2E Tests (Playwright): Placed in the root `tests/e2e/` directory, testing complete user journeys.

### Development Workflow Integration

**Build Process Structure:**
Vite builds the output to the `/dist/` folder. The GitHub Actions CI/CD pipeline (`.github/workflows/deploy.yml`) will deploy this folder to GitHub Pages. `vite-plugin-pwa` automatically injects the service worker manifest during this build step.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All decisions are highly compatible. The choice of Vite + React 19 + Tailwind v4 + Zustand + Dexie.js represents a modern, robust, and highly performant stack for a PWA. There are no inherent conflicts between these technologies.

**Pattern Consistency:**
The "Storage Abstraction Pattern" perfectly bridges the gap between the immediate need for IndexedDB (via Dexie) and the potential future need for native mobile storage, ensuring the React component logic remains pure and consistent.

**Structure Alignment:**
The Feature-Based project structure fully supports the architectural decisions, cleanly separating generic UI primitives from domain-specific logic (Reader, Library) and isolating external side-effects (Dexie, Network) into the `services/` and `hooks/` layers.

### Requirements Coverage Validation ✅

**Epic/Feature Coverage:**
Both primary epics (Reader UI and Library Hub) are fully supported. The Reader Engine has dedicated state (Zustand) and structural accommodation.

**Functional Requirements Coverage:**
- *Offline Capability:* Addressed via `vite-plugin-pwa` (Service Worker) and Dexie.js.
- *Pagination:* Addressed conceptually; the architecture provides the pure React + Zustand environment necessary to build the complex calculation hooks without interference from standard UI library limitations.
- *Bookmarks/Settings:* Persisted via Dexie.js.

**Non-Functional Requirements Coverage:**
- *Performance (60fps):* Addressed by stripping heavy component libraries, relying on Tailwind v4, and using Zustand to prevent prop-drilling and unnecessary re-renders.
- *Accessibility:* Addressed by the structural inclusion of Radix UI primitives for complex interactions and CSS variables for theming.

### Implementation Readiness Validation ✅

**Decision Completeness:**
All critical decisions blocking implementation (Starter, Storage, State, Routing) have been made and documented with specific versions.

**Structure Completeness:**
The complete directory structure is documented, providing a clear blueprint for the first implementation agent.

**Pattern Completeness:**
Crucial patterns such as the Storage Abstraction, Naming Conventions, and offline-first error handling have been explicitly defined, minimizing the risk of AI agents writing conflicting code.

### Gap Analysis Results

**Important Gaps:**
- *Testing Strategy (Currently Deferred):* While we have a `tests/` folder, the specific testing framework (Vitest vs Jest) and E2E tool (Playwright vs Cypress) haven't been rigidly defined yet. Given the complexity of the pagination engine, Vitest + React Testing Library should be assumed for unit tests.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**
- Extremely minimal dependencies focused entirely on performance.
- Clear separation of concerns protecting future hybrid migration paths.
- Highly aligned with the distinct "Chromeless" reading requirements.

**Areas for Future Enhancement:**
- Defining the precise Vitest testing strategy for the pagination algorithm before coding begins.
- Detailed indexing strategy for local search if the JSON catalog grows excessively large.

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented.
- Use implementation patterns consistently across all components.
- Respect project structure and boundaries.
- Refer to this document for all architectural questions.

**First Implementation Priority:**
```bash
npm create vite@latest monkai-reader -- --template react
cd monkai-reader
npm install tailwindcss @tailwindcss/vite zustand dexie react-router
npm install vite-plugin-pwa -D
```
