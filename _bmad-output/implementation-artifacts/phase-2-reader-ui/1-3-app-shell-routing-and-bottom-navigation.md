# Story 1.3: App Shell, Routing & Bottom Navigation

Status: done

## Story

As a **user**,
I want to open the Monkai app and see a navigable shell with four tabs,
So that I can orient myself and move between the app's major sections.

## Acceptance Criteria

1. **Given** the app is opened at the root URL
   **When** the shell loads
   **Then** a `<BottomNav>` component renders four tabs: Trang Chủ (`/`), Thư Viện (`/library`), Đánh Dấu (`/bookmarks`), Cài Đặt (`/settings`), each with an icon and label

2. **Given** React Router v6 with `basename={import.meta.env.VITE_BASE_PATH ?? '/'}`
   **When** a user taps any bottom nav tab
   **Then** the URL updates and the correct placeholder page renders without a full page reload, and the tapped tab appears active

3. **Given** routes `/read/:bookId` and `/library/:category`
   **When** navigated to directly by deep link
   **Then** the correct placeholder page renders and the bottom nav highlights the appropriate parent tab

4. **Given** React Router `React.lazy()` per route
   **When** `vite build` runs
   **Then** each route produces a separate chunk in `dist/`

5. **Given** `shared/constants/routes.ts` exports all route path constants
   **When** any component navigates programmatically
   **Then** it imports from `routes.ts` — no hardcoded path strings exist in component files

## Tasks / Subtasks

- [ ] Task 1: Create route constants file (AC: #5)
  - [ ] Subtask 1.1: Create `apps/reader/src/shared/constants/routes.ts`
  - [ ] Subtask 1.2: Export constants: `HOME = '/'`, `LIBRARY = '/library'`, `LIBRARY_CATEGORY = '/library/:category'`, `READ = '/read/:bookId'`, `BOOKMARKS = '/bookmarks'`, `SETTINGS = '/settings'`
  - [ ] Subtask 1.3: Export helper functions: `toRead(bookId: string): string` → `/read/${bookId}`, `toCategory(category: string): string` → `/library/${category}`

- [ ] Task 2: Create placeholder page components (AC: #1, #2, #3)
  - [ ] Subtask 2.1: Create `apps/reader/src/features/home/HomePage.tsx` — renders `<div>Trang Chủ (placeholder)</div>`
  - [ ] Subtask 2.2: Create `apps/reader/src/features/library/LibraryPage.tsx` — renders `<div>Thư Viện (placeholder)</div>`
  - [ ] Subtask 2.3: Create `apps/reader/src/features/library/CategoryPage.tsx` — renders `<div>Category: {params.category} (placeholder)</div>` using `useParams()`
  - [ ] Subtask 2.4: Create `apps/reader/src/features/reader/ReaderPage.tsx` — renders `<div>Reader: {params.bookId} (placeholder)</div>` using `useParams()`
  - [ ] Subtask 2.5: Create `apps/reader/src/features/bookmarks/BookmarksPage.tsx` — renders `<div>Đánh Dấu (placeholder)</div>`
  - [ ] Subtask 2.6: Create `apps/reader/src/features/settings/SettingsPage.tsx` — renders `<div>Cài Đặt (placeholder)</div>`

- [ ] Task 3: Create `BottomNav` component (AC: #1, #2, #3)
  - [ ] Subtask 3.1: Create `apps/reader/src/shared/components/BottomNav.tsx`
  - [ ] Subtask 3.2: Implement 4 nav items using `<NavLink>` from react-router-dom (auto active class via `className` prop)
  - [ ] Subtask 3.3: Tab definitions: `{ label: 'Trang Chủ', to: ROUTES.HOME, icon: HomeIcon }`, `{ label: 'Thư Viện', to: ROUTES.LIBRARY, icon: BookIcon }`, `{ label: 'Đánh Dấu', to: ROUTES.BOOKMARKS, icon: BookmarkIcon }`, `{ label: 'Cài Đặt', to: ROUTES.SETTINGS, icon: SettingsIcon }`
  - [ ] Subtask 3.4: Use simple SVG icons inline or from Radix UI Icons (`@radix-ui/react-icons`) — do NOT add a large icon library
  - [ ] Subtask 3.5: Active tab styling: use `aria-current="page"` from NavLink + CSS to highlight active tab with `--color-accent`
  - [ ] Subtask 3.6: Ensure touch targets are minimum 44×44px (CSS `min-height: 44px` on each tab item)
  - [ ] Subtask 3.7: BottomNav is hidden on `/read/:bookId` route (will be controlled by ChromelessLayout in Epic 3 — for now, hide via route check)

- [ ] Task 4: Set up React Router in `App.tsx` (AC: #2, #3, #4)
  - [ ] Subtask 4.1: Install react-router-dom (should be in package.json from Story 1.1)
  - [ ] Subtask 4.2: In `apps/reader/src/App.tsx`, wrap with `<BrowserRouter basename={import.meta.env.VITE_BASE_PATH ?? '/'}>`
  - [ ] Subtask 4.3: Set up `<Routes>` with lazy-loaded route components using `React.lazy()` + `<Suspense>`
  - [ ] Subtask 4.4: Define all routes: `/`, `/library`, `/library/:category`, `/read/:bookId`, `/bookmarks`, `/settings`
  - [ ] Subtask 4.5: Render `<BottomNav>` outside `<Routes>` so it persists across route changes (conditionally hide on reader route)
  - [ ] Subtask 4.6: Add a catch-all `<Route path="*" element={<Navigate to={ROUTES.HOME} replace />}` for 404 handling

- [ ] Task 5: Configure `main.tsx` (AC: #2)
  - [ ] Subtask 5.1: In `apps/reader/src/main.tsx`, render `<App />` with React 18's `createRoot`
  - [ ] Subtask 5.2: Apply default theme class to `<html>` on load: `document.documentElement.classList.add('theme-sepia')` (will be replaced by stored preference in Epic 4)
  - [ ] Subtask 5.3: Register service worker (vite-plugin-pwa provides `useRegisterSW` hook — wire up in main.tsx or App.tsx)

- [ ] Task 6: Verify code-splitting (AC: #4)
  - [ ] Subtask 6.1: Run `pnpm build` and inspect `dist/assets/` — each lazy route should produce a separate JS chunk
  - [ ] Subtask 6.2: Confirm no route is bundled into the main chunk (check via `vite build --report` or manual inspection)

## Dev Notes

### Route Constants

```typescript
// src/shared/constants/routes.ts
export const ROUTES = {
  HOME: '/' as const,
  LIBRARY: '/library' as const,
  LIBRARY_CATEGORY: '/library/:category' as const,
  READ: '/read/:bookId' as const,
  BOOKMARKS: '/bookmarks' as const,
  SETTINGS: '/settings' as const,
} as const

export function toRead(bookId: string): string {
  return `/read/${bookId}`
}

export function toCategory(category: string): string {
  return `/library/${category}`
}
```

### App.tsx Router Setup

```tsx
// src/App.tsx
import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ROUTES } from '@/shared/constants/routes'
import { BottomNav } from '@/shared/components/BottomNav'

const HomePage = React.lazy(() => import('@/features/home/HomePage'))
const LibraryPage = React.lazy(() => import('@/features/library/LibraryPage'))
const CategoryPage = React.lazy(() => import('@/features/library/CategoryPage'))
const ReaderPage = React.lazy(() => import('@/features/reader/ReaderPage'))
const BookmarksPage = React.lazy(() => import('@/features/bookmarks/BookmarksPage'))
const SettingsPage = React.lazy(() => import('@/features/settings/SettingsPage'))

function AppShell() {
  const location = useLocation()
  const isReaderRoute = location.pathname.startsWith('/read/')

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <main className="flex-1 overflow-auto pb-16">
        <Suspense fallback={<div className="p-4">Loading...</div>}>
          <Routes>
            <Route path={ROUTES.HOME} element={<HomePage />} />
            <Route path={ROUTES.LIBRARY} element={<LibraryPage />} />
            <Route path={ROUTES.LIBRARY_CATEGORY} element={<CategoryPage />} />
            <Route path={ROUTES.READ} element={<ReaderPage />} />
            <Route path={ROUTES.BOOKMARKS} element={<BookmarksPage />} />
            <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
            <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
          </Routes>
        </Suspense>
      </main>
      {!isReaderRoute && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.VITE_BASE_PATH ?? '/'}>
      <AppShell />
    </BrowserRouter>
  )
}
```

Note: `AppShell` is a separate component inside `BrowserRouter` so it can call `useLocation()` (router hooks require being inside a Router context).

### BottomNav Component

```tsx
// src/shared/components/BottomNav.tsx
import { NavLink } from 'react-router-dom'
import { ROUTES } from '@/shared/constants/routes'

const tabs = [
  { label: 'Trang Chủ', to: ROUTES.HOME, icon: '🏠' },  // Replace with SVG
  { label: 'Thư Viện',  to: ROUTES.LIBRARY, icon: '📚' },
  { label: 'Đánh Dấu',  to: ROUTES.BOOKMARKS, icon: '🔖' },
  { label: 'Cài Đặt',   to: ROUTES.SETTINGS, icon: '⚙️' },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 border-t flex"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      aria-label="Bottom navigation"
    >
      {tabs.map(({ label, to, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === ROUTES.HOME}  // `end` ensures / only matches exact path
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-xs transition-colors ${
              isActive
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)]'
            }`
          }
          aria-label={label}
        >
          <span className="text-xl mb-0.5" aria-hidden="true">{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```

**Icon guidance:** Replace emoji placeholders with proper SVG icons. Radix Icons (`@radix-ui/react-icons`) is preferred for consistency. Install: `pnpm add @radix-ui/react-icons`. Use `HomeIcon`, `ReaderIcon`, `BookmarkIcon`, `GearIcon` from the package.

### NavLink `end` Prop

Use `end` on the Home NavLink (`/`) — without it, the Home tab will always appear active since every path starts with `/`.

### Active Tab for Reader Parent

The `/library/:category` route should highlight the "Thư Viện" tab. This happens automatically with NavLink because `/library/:category` starts with `/library` and NavLink does prefix matching by default (when `end` is not set on the Library NavLink).

### Lazy Route Code Splitting

Vite automatically code-splits `React.lazy()` imports. Each `import('@/features/.../Page')` call becomes a separate chunk. Do not use dynamic imports inside components — only at the route level in App.tsx.

### main.tsx

```tsx
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Apply default reading theme (will be replaced by persisted setting in Epic 4)
document.documentElement.classList.add('theme-sepia')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

### Project Structure Notes

Files created in this story:
- `apps/reader/src/shared/constants/routes.ts` — NEW
- `apps/reader/src/shared/components/BottomNav.tsx` — NEW
- `apps/reader/src/features/home/HomePage.tsx` — NEW (placeholder)
- `apps/reader/src/features/library/LibraryPage.tsx` — NEW (placeholder)
- `apps/reader/src/features/library/CategoryPage.tsx` — NEW (placeholder)
- `apps/reader/src/features/reader/ReaderPage.tsx` — NEW (placeholder)
- `apps/reader/src/features/bookmarks/BookmarksPage.tsx` — NEW (placeholder)
- `apps/reader/src/features/settings/SettingsPage.tsx` — NEW (placeholder)
- `apps/reader/src/App.tsx` — MODIFIED (replace scaffold content with routing shell)
- `apps/reader/src/main.tsx` — MODIFIED (theme init, createRoot)

### No Hardcoded Strings

All components navigating programmatically must use `ROUTES` constants or helper functions (`toRead()`, `toCategory()`). If you find yourself typing `"/library"` or `"/read/"` inside a component, stop and import from routes.ts instead.

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 1.3]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Frontend Architecture — Routing]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Naming Patterns]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Structure Patterns — Directory Organization]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
