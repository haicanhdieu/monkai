# Story 5.1: Font Size Control & Pagination Reflow

Status: ready-for-dev

## Story

As a **user**,
I want to increase or decrease the text font size,
so that I can read comfortably regardless of my eyesight or device.

## Acceptance Criteria

1. **Given** `<FontSizeControl>` in `SettingsPage` (Radix UI Slider primitive)
   **When** the user drags the slider
   **Then** `settings.store.setFontSize(value)` fires with a value between 14px and 28px in 2px increments

2. **Given** `settings.store.fontSize` changes
   **When** `ReaderEngine` re-renders (via `useDOMPagination` dependency on `fontSize`)
   **Then** `useDOMPagination` is called with the new `fontSize`, producing a recalculated `pages[]` array, and the reader resets to page 1 of the new layout

3. **Given** a font size of 28px (maximum)
   **When** the reader renders
   **Then** the layout does not break — text remains within the reading column without horizontal overflow

4. **Given** a font size change
   **When** `settings.store.setFontSize` fires
   **Then** `StorageService.setItem(STORAGE_KEYS.USER_SETTINGS, { fontSize, theme })` is called silently (no save button required)

5. **Given** the user reopens the app after setting font size to 24px
   **When** `useStorageHydration` runs
   **Then** `settings.store.hydrate({ fontSize: 24, theme })` restores the preference before the first render

## Tasks / Subtasks

- [ ] Task 1: Create `FontSizeControl` component (AC: 1)
  - [ ] Create `apps/reader/src/features/settings/FontSizeControl.tsx`
  - [ ] Use `@radix-ui/react-slider` — `min={14}` `max={28}` `step={2}` `defaultValue={[fontSize]}`
  - [ ] Import `useSettingsStore` from `@/stores/settings.store`; read `fontSize`, call `setFontSize` on `onValueChange`
  - [ ] Display current font size label: "Cỡ chữ: {fontSize}px"
  - [ ] Apply theme CSS custom properties for colors (never hardcode)
  - [ ] Minimum 44×44px touch target on the slider track area

- [ ] Task 2: Wire `ReaderEngine` to read `fontSize` from settings store (AC: 2, 3)
  - [ ] In `apps/reader/src/features/reader/ReaderEngine.tsx`, import `useSettingsStore` from `@/stores/settings.store`
  - [ ] Replace `const READER_FONT_SIZE = 18` usage with `const { fontSize } = useSettingsStore()`
  - [ ] Pass `fontSize` (not the constant) to `useDOMPagination` options
  - [ ] Add a `useEffect` that resets `setCurrentPage(0)` when `fontSize` changes (skip on mount using a ref to track previous value)

- [ ] Task 3: Add silent persistence to `setFontSize` (AC: 4)
  - [ ] In `apps/reader/src/stores/settings.store.ts`, import `storageService` from `@/shared/services/storage.service` and `STORAGE_KEYS` from `@/shared/constants/storage.keys`
  - [ ] After `set((state) => { state.fontSize = value })` in `setFontSize`, call: `storageService.setItem(STORAGE_KEYS.USER_SETTINGS, { fontSize: value, theme: get().theme })` (use Zustand `get` arg)
  - [ ] Do NOT show any UI indicator — silent persistence

- [ ] Task 4: Verify hydration already works (AC: 5)
  - [ ] Confirm `useStorageHydration.ts` loads `STORAGE_KEYS.USER_SETTINGS` and calls `useSettingsStore.getState().hydrate(settings)` — it already does (no code change needed)
  - [ ] Verify `settings.store.hydrate` sets both `fontSize` and `theme` — it already does

- [ ] Task 5: Write tests (AC: 1, 2, 4)
  - [ ] Create `apps/reader/src/features/settings/FontSizeControl.test.tsx`
  - [ ] Test: slider renders with correct min/max/step/value from store
  - [ ] Test: changing slider value calls `setFontSize` with correct number
  - [ ] Test: `storageService.setItem` is called with merged `{ fontSize, theme }` on font size change

## Dev Notes

### Critical Context

**What already exists:**
- `settings.store.ts` — fully implemented with `setFontSize(value)`, `setTheme(theme)`, `hydrate(settings)`, `reset()`, `DEFAULT_SETTINGS = { fontSize: 18, theme: 'sepia' }` [Source: apps/reader/src/stores/settings.store.ts]
- `useStorageHydration.ts` — already hydrates settings from `STORAGE_KEYS.USER_SETTINGS` into `settings.store` [Source: apps/reader/src/shared/hooks/useStorageHydration.ts]
- `@radix-ui/react-slider` — already installed in `package.json`
- `STORAGE_KEYS.USER_SETTINGS = 'user_settings'` — already defined [Source: apps/reader/src/shared/constants/storage.keys.ts]
- `useDOMPagination` — already uses `fontSize` in its cache key: `pagination:${bookId}:${count}:${vw}x${vh}:${fontSize}:${lineHeight}` — changing fontSize will trigger full recalculation [Source: apps/reader/src/features/reader/useDOMPagination.ts]

**What needs to change:**
- `ReaderEngine.tsx` has `const READER_FONT_SIZE = 18` hardcoded on line 11 — this is the primary change for this story
- `settings.store.ts` `setFontSize` does NOT currently persist to storage — add persistence here

**IMPORTANT — Persistence requires `get` in Zustand:**
To persist `{ fontSize, theme }` (not just `fontSize`) in `setFontSize`, you need access to current `theme`. Use Zustand's `get` argument:
```typescript
// In create<SettingsState>()(immer((set, get) => ({
setFontSize: (value) => {
  set((state) => { state.fontSize = value })
  void storageService.setItem(STORAGE_KEYS.USER_SETTINGS, {
    fontSize: value,
    theme: get().theme,
  })
},
```
This means the store creator signature must change from `immer((set) => ...)` to `immer((set, get) => ...)`. Story 5.2 will do the same for `setTheme`.

**Reset to page 1 on fontSize change:**
```typescript
// In ReaderEngine.tsx — add after the existing useEffects
const { fontSize } = useSettingsStore()
const prevFontSizeRef = useRef(fontSize)
useEffect(() => {
  if (prevFontSizeRef.current !== fontSize) {
    prevFontSizeRef.current = fontSize
    setCurrentPage(0)
  }
}, [fontSize, setCurrentPage])
```
This prevents resetting on initial mount (which would override the hydrated `lastReadPosition`).

**FontSizeControl implementation:**
```tsx
// apps/reader/src/features/settings/FontSizeControl.tsx
import * as Slider from '@radix-ui/react-slider'
import { useSettingsStore } from '@/stores/settings.store'

export function FontSizeControl() {
  const { fontSize, setFontSize } = useSettingsStore()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          Cỡ chữ
        </label>
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {fontSize}px
        </span>
      </div>
      <Slider.Root
        className="relative flex min-h-[44px] w-full touch-none select-none items-center"
        min={14}
        max={28}
        step={2}
        value={[fontSize]}
        onValueChange={([value]) => setFontSize(value)}
        aria-label="Cỡ chữ"
      >
        <Slider.Track
          className="relative h-1 grow rounded-full"
          style={{ backgroundColor: 'var(--color-border)' }}
        >
          <Slider.Range
            className="absolute h-full rounded-full"
            style={{ backgroundColor: 'var(--color-accent)' }}
          />
        </Slider.Track>
        <Slider.Thumb
          className="block h-6 w-6 rounded-full shadow focus:outline-none"
          style={{ backgroundColor: 'var(--color-accent)' }}
        />
      </Slider.Root>
      <div className="flex justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span>A</span>
        <span className="text-base">A</span>
      </div>
    </div>
  )
}
```

**useDOMPagination cache key uses fontSize:** The cache key is `pagination:${bookId}:${count}:${vw}x${vh}:${fontSize}:${lineHeight}`. When fontSize changes, the key changes, cache miss → full recomputation. The `pages` returned will be different → the `useEffect` in ReaderEngine that calls `setPages(pages)` will fire. This is the automatic recalculation path — no extra wiring needed beyond passing `fontSize` from the store.

### Project Structure Notes

New files:
- `apps/reader/src/features/settings/FontSizeControl.tsx`
- `apps/reader/src/features/settings/FontSizeControl.test.tsx`

Modified files:
- `apps/reader/src/stores/settings.store.ts` — add persistence in `setFontSize`, add `get` arg
- `apps/reader/src/features/reader/ReaderEngine.tsx` — use `fontSize` from store, reset page on change

### Architecture Compliance

- Use `@radix-ui/react-slider` — already installed, do NOT use `<input type="range">` directly
- Use `useSettingsStore()` for font size state — NEVER local `useState`
- Call `storageService.setItem` — NEVER call `localStorage` or `indexedDB` directly [Source: architecture-reader-ui.md#Enforcement Guidelines]
- Import `STORAGE_KEYS` from `@/shared/constants/storage.keys` — never use string literal `'user_settings'`
- Use `@/` absolute imports across feature boundaries [Source: architecture-reader-ui.md#Naming Patterns]
- No `try/catch` in component — errors stay in service layer [Source: architecture-reader-ui.md#Process Patterns]
- Touch targets: minimum 44×44px [Source: architecture-reader-ui.md#NFR - 44px touch targets]
- Theme colors via CSS custom properties only (`var(--color-*)`) — never hardcoded hex values

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 5.1]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Frontend Architecture - Pagination Engine]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Enforcement Guidelines]
- [Source: apps/reader/src/features/reader/ReaderEngine.tsx — READER_FONT_SIZE = 18 on line 11]
- [Source: apps/reader/src/features/reader/useDOMPagination.ts — fontSize in cache key]
- [Source: apps/reader/src/stores/settings.store.ts — setFontSize, hydrate]
- [Source: apps/reader/src/shared/hooks/useStorageHydration.ts — already hydrates USER_SETTINGS]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
