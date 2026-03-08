# Story 5.2: Reading Themes — Sepia, Light & Dark

Status: done

## Story

As a **user**,
I want to switch between Sepia, Light, and Dark reading environments,
so that I can read comfortably in any lighting condition.

## Acceptance Criteria

1. **Given** `<ThemeToggle>` in `SettingsPage` with three options: Sepia, Light, Dark
   **When** the user selects a theme
   **Then** `settings.store.setTheme(theme)` fires and `useTheme` hook sets the corresponding class (`.theme-sepia`, `.theme-light`, or `.theme-dark`) on `document.documentElement`

2. **Given** a theme class is applied to `<html>`
   **When** any component renders
   **Then** it inherits the active theme's CSS custom properties (`--color-background`, `--color-text`, `--color-accent`) — no theme classes are applied to child elements directly

3. **Given** the Dark theme is active
   **When** the reader renders
   **Then** the background is a deep grey (not pure black) and text is off-white — both meeting WCAG AA 4.5:1 contrast

4. **Given** the Sepia theme is active (default)
   **When** `App.tsx` mounts for the very first time (no stored preference)
   **Then** `.theme-sepia` is the default class on `<html>`

5. **Given** the user switches themes while reading
   **When** the theme class changes on `<html>`
   **Then** the `ChromelessLayout` overlay bars and `<BottomNav>` update colors immediately — no flash of wrong theme

6. **Given** a theme change
   **When** `settings.store.setTheme` fires
   **Then** `StorageService.setItem(STORAGE_KEYS.USER_SETTINGS, { fontSize, theme })` is called silently

## Tasks / Subtasks

- [x] Task 1: Create `useTheme` hook (AC: 1, 2, 4, 5)
  - [x] Create `apps/reader/src/shared/hooks/useTheme.ts`
  - [x] Read `theme` from `useSettingsStore()`
  - [x] In a `useEffect`, replace all theme classes on `document.documentElement`: remove `.theme-sepia`, `.theme-light`, `.theme-dark`, then add `.theme-{theme}`
  - [x] Effect depends on `[theme]` — fires whenever theme changes
  - [x] This hook does NOT return anything — purely a side-effect hook

- [x] Task 2: Call `useTheme` in `AppShell` (AC: 4, 5)
  - [x] In `apps/reader/src/App.tsx`, import `useTheme` from `@/shared/hooks/useTheme`
  - [x] Call `useTheme()` inside `AppShell` (alongside `useStorageHydration()` and `useCatalogSync()`)
  - [x] Remove the static `document.documentElement.classList.add('theme-sepia')` from `apps/reader/src/main.tsx` — it is replaced by `useTheme` which reads the persisted (or default) setting

- [x] Task 3: Create `ThemeToggle` component (AC: 1, 3)
  - [x] Create `apps/reader/src/features/settings/ThemeToggle.tsx`
  - [x] Three-button toggle: Sepia | Light | Dark (Vietnamese: "Vàng" | "Sáng" | "Tối")
  - [x] Active button highlighted with `var(--color-accent)` background, white text; inactive buttons use `var(--color-surface)` background
  - [x] Each button: minimum 44×44px touch target
  - [x] On button click: call `settings.store.setTheme(theme)`
  - [x] Read active theme from `useSettingsStore()` to show selected state

- [x] Task 4: Add silent persistence to `setTheme` in settings store (AC: 6)
  - [x] In `apps/reader/src/stores/settings.store.ts`, ensure `get` is available (Story 5.1 adds `get` arg — build on top of it)
  - [x] After `set((state) => { state.theme = theme })` in `setTheme`, call: `storageService.setItem(STORAGE_KEYS.USER_SETTINGS, { fontSize: get().fontSize, theme })`
  - [x] Do NOT show any UI indicator — silent persistence

- [x] Task 5: Write tests (AC: 1, 4, 6)
  - [x] Create `apps/reader/src/shared/hooks/useTheme.test.ts`
  - [x] Test: applying `.theme-sepia` when theme is 'sepia'
  - [x] Test: switching from sepia to dark removes `.theme-sepia` and adds `.theme-dark`
  - [x] Test: default is sepia (from store default)
  - [x] Create `apps/reader/src/features/settings/ThemeToggle.test.tsx`
  - [x] Test: three buttons render; active button matches store theme
  - [x] Test: clicking a button calls `setTheme`
  - [x] Test: `storageService.setItem` called with correct `{ fontSize, theme }` on theme change

## Dev Notes

### Critical Context

**Prerequisite: Story 5.1 must be complete first:**
- `settings.store.ts` now has `get` arg available (added in 5.1 for `setFontSize` persistence)
- `storageService` already imported in `settings.store.ts` (added in 5.1)

**Theme CSS is already defined in `index.css`:**
```css
/* Already in apps/reader/src/index.css */
.theme-sepia {
  --color-background: #F5EDD6;
  --color-text: #3D2B1F;
  --color-text-muted: #7A5C42;
  --color-accent: #C8883A;
  --color-surface: #EDE0C4;
  --color-border: #D4C4A0;
}
.theme-light {
  --color-background: #FFFFFF;
  --color-text: #1A1A1A;
  --color-text-muted: #6B6B6B;
  --color-accent: #C8883A;
  --color-surface: #F5F5F5;
  --color-border: #E0E0E0;
}
.theme-dark {
  --color-background: #1A1207;
  --color-text: #E8D5B0;
  --color-text-muted: #B8A07C;
  --color-accent: #D4944A;
  --color-surface: #2A1E0F;
  --color-border: #3D2B1F;
}
```
Do NOT add new CSS — use existing properties.

**Current `main.tsx` static theme class (must be removed):**
```typescript
// apps/reader/src/main.tsx line 8 — REMOVE THIS:
document.documentElement.classList.add('theme-sepia')
```
Replace with `useTheme()` in `AppShell` which reads the persisted or default setting.

**IMPORTANT — Flash of wrong theme (FOWT) consideration:**
The static `.theme-sepia` in `main.tsx` was a temporary guard to prevent unstyled flash. Removing it creates a brief moment before `useStorageHydration` runs and before `useTheme` applies the class. To prevent this:
- Approach: Keep a minimal inline script in `index.html` to apply the stored theme class before React renders. This is the idiomatic pattern (like dark mode script tags in Next.js). Add this to `index.html` `<head>`:
```html
<script>
  try {
    var s = JSON.parse(localStorage.getItem('localforage/user_settings') || '{}');
    var t = (s && s.theme) ? s.theme : 'sepia';
    document.documentElement.classList.add('theme-' + t);
  } catch(e) {
    document.documentElement.classList.add('theme-sepia');
  }
</script>
```
  - **NOTE:** localforage stores keys as `localforage/{key}` in localStorage by default. Verify the actual key used by checking localforage docs or the stored value in browser devtools before finalizing this script.
  - If this is too complex, a simpler alternative: keep `theme-sepia` in `main.tsx` but have `useTheme` replace it. The flash only occurs when the user has non-sepia persisted — acceptable trade-off for MVP.
  - **Recommended (simpler):** Keep the static `theme-sepia` in `main.tsx` as a fallback. `useTheme` will replace it on first render. The only flash is if the user has a different stored theme — brief and acceptable.

**`useTheme` hook implementation:**
```typescript
// apps/reader/src/shared/hooks/useTheme.ts
import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import type { ReadingTheme } from '@/stores/settings.store'

const THEME_CLASSES: ReadingTheme[] = ['sepia', 'light', 'dark']

export function useTheme() {
  const theme = useSettingsStore((state) => state.theme)

  useEffect(() => {
    const root = document.documentElement
    THEME_CLASSES.forEach((t) => root.classList.remove(`theme-${t}`))
    root.classList.add(`theme-${theme}`)
  }, [theme])
}
```

**`ThemeToggle` implementation:**
```tsx
// apps/reader/src/features/settings/ThemeToggle.tsx
import { useSettingsStore } from '@/stores/settings.store'
import type { ReadingTheme } from '@/stores/settings.store'

const THEME_OPTIONS: { value: ReadingTheme; label: string }[] = [
  { value: 'sepia', label: 'Vàng' },
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
]

export function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore()

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        Giao diện
      </label>
      <div className="flex gap-2">
        {THEME_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl text-sm font-medium transition-colors"
            style={
              theme === value
                ? { backgroundColor: 'var(--color-accent)', color: '#fff' }
                : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }
            }
            aria-pressed={theme === value}
            aria-label={`Giao diện ${label}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**App.tsx update — add `useTheme()` call:**
```typescript
// apps/reader/src/App.tsx — inside AppShell()
import { useTheme } from '@/shared/hooks/useTheme'

function AppShell() {
  useStorageHydration()
  useCatalogSync()
  useTheme()  // ← add this line
  // ... rest unchanged
}
```

**`setTheme` persistence in settings.store.ts:**
```typescript
// Build on top of Story 5.1 changes (get arg already added)
setTheme: (theme) => {
  set((state) => { state.theme = theme })
  void storageService.setItem(STORAGE_KEYS.USER_SETTINGS, {
    fontSize: get().fontSize,
    theme,
  })
},
```

**Architecture rule — theme applied to `<html>` ONLY:**
Never add `.theme-*` classes to any child element. The CSS cascade handles everything from `<html>` down. This is enforced by the architecture. [Source: architecture-reader-ui.md#Theme Application]

**WCAG contrast verification:**
All three themes already defined in `index.css` were designed to meet WCAG AA 4.5:1. Do NOT change the color values. The contrast requirement is already satisfied architecturally.

**No flash during theme switching (AC 5):**
Since all components use `var(--color-*)` CSS custom properties, changing the class on `<html>` causes immediate cascade re-evaluation. React does not need to re-render — the browser CSS engine handles it. Zero flash guaranteed by CSS cascade.

### Project Structure Notes

New files:
- `apps/reader/src/shared/hooks/useTheme.ts`
- `apps/reader/src/shared/hooks/useTheme.test.ts`
- `apps/reader/src/features/settings/ThemeToggle.tsx`
- `apps/reader/src/features/settings/ThemeToggle.test.tsx`

Modified files:
- `apps/reader/src/stores/settings.store.ts` — add persistence in `setTheme` (Story 5.1 already adds `get` and `storageService`)
- `apps/reader/src/App.tsx` — call `useTheme()` inside `AppShell`
- `apps/reader/src/main.tsx` — optionally replace static `theme-sepia` class with inline script (or keep as fallback — see Dev Notes)

### Architecture Compliance

- Theme class applied ONLY to `document.documentElement` — never to child components [Source: architecture-reader-ui.md#Theme Application]
- Call `storageService.setItem` — NEVER `localStorage` directly [Source: architecture-reader-ui.md#Enforcement Guidelines]
- Import `STORAGE_KEYS` from `@/shared/constants/storage.keys` — never string literals
- `useTheme` is a shared hook — placed in `shared/hooks/` not inside any feature folder
- `ThemeToggle` is a settings-specific component — placed in `features/settings/` [Source: architecture-reader-ui.md#Directory Organization]
- `const` object with `as const` for theme options (no enum) [Source: architecture-reader-ui.md#Code Conventions]
- Touch targets: minimum 44×44px (`min-h-[44px]`) [Source: architecture-reader-ui.md#NFR]
- Use selector (`useSettingsStore((state) => state.theme)`) in `useTheme` to avoid re-render when other store state changes

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 5.2]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Theme Application]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Enforcement Guidelines]
- [Source: apps/reader/src/index.css — .theme-sepia, .theme-light, .theme-dark definitions]
- [Source: apps/reader/src/main.tsx line 8 — static theme-sepia class to remove]
- [Source: apps/reader/src/App.tsx — AppShell where useTheme() is called]
- [Source: apps/reader/src/stores/settings.store.ts — setTheme, DEFAULT_SETTINGS.theme = 'sepia']

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created `useTheme` hook in `shared/hooks/useTheme.ts` — side-effect only, replaces all theme classes on `document.documentElement` on theme change
- Called `useTheme()` in `AppShell` in `App.tsx` alongside existing hooks; static `theme-sepia` in `main.tsx` kept as pre-React fallback (simpler approach per Dev Notes)
- Created `ThemeToggle.tsx` in `features/settings/` — 3 buttons with 44px touch targets, `aria-pressed` states, calls `setTheme` on click
- Added persistence to `setTheme` in `settings.store.ts` — calls `storageService.setItem` with merged `{ fontSize, theme }`
- 15 tests added across 3 test files (useTheme, ThemeToggle, settings.store) — all passing

### File List

- `apps/reader/src/shared/hooks/useTheme.ts` (new)
- `apps/reader/src/shared/hooks/useTheme.test.ts` (new)
- `apps/reader/src/features/settings/ThemeToggle.tsx` (new)
- `apps/reader/src/features/settings/ThemeToggle.test.tsx` (new)
- `apps/reader/src/stores/settings.store.ts` (modified — setTheme persistence)
- `apps/reader/src/App.tsx` (modified — useTheme() added to AppShell)

### Change Log

- 2026-03-08: Story 5.2 implemented — useTheme hook, ThemeToggle component, setTheme persistence, App.tsx wired
- 2026-03-08: Code review fixes — ThemeToggle `<label>` → `<span>` (accessibility), active button color `#fff` → `var(--color-background)` (arch compliance), useTheme.test.ts `as never` cast replaced with proper selector mock
