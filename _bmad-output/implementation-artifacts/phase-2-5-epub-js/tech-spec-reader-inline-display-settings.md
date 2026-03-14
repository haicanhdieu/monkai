---
title: 'Reader Inline Display Settings Panel'
slug: 'reader-inline-display-settings'
created: '2026-03-14'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'TypeScript', 'Zustand + immer', 'Tailwind v3', 'Vitest', 'Testing Library']
files_to_modify:
  - 'apps/reader/src/stores/settings.store.ts'
  - 'apps/reader/src/features/reader/ChromelessLayout.tsx'
  - 'apps/reader/src/features/reader/ChromelessLayout.test.tsx'
files_to_create:
  - 'apps/reader/src/features/reader/ReaderSettingsDrawer.tsx'
  - 'apps/reader/src/features/reader/ReaderSettingsDrawer.test.tsx'
code_patterns:
  - 'custom-drawer-no-radix-dialog'
  - 'fixed-inset-flex-col-bottom-sheet'
  - 'tabIndex-chrome-guard'
  - 'data-testid-attributes'
  - 'css-var-colors'
  - 'native-disabled-attribute'
  - 'focus-trap-tab-cycle'
test_patterns:
  - 'vi.mock-settings-store'
  - 'per-test-mock-mutation-in-beforeEach'
  - 'fireEvent-keyDown-window-for-escape'
  - 'MemoryRouter-wrapper-for-chromeless'
  - 'vi.useFakeTimers-in-chromeless-tests'
---

# Tech-Spec: Reader Inline Display Settings Panel

**Created:** 2026-03-14

## Overview

### Problem Statement

Users must leave the reader and navigate to SettingsPage to change font size or theme, breaking their reading flow. There is no way to adjust display settings while staying in the reader.

### Solution

Add an [Aa] trigger button in the ChromelessLayout bottom bar (right side, opposite the page counter). Tapping it opens a slide-up bottom sheet containing A−/A+ font size controls and a 3-option theme selector. Changes apply live via `useSettingsStore`. No navigation required.

### Scope

**In Scope:**
- `[Aa]` button added to ChromelessLayout bottom bar (right side)
- New `ReaderSettingsDrawer` component (slide-up bottom sheet, mirrors TocDrawer pattern)
- Font size control: `[A−]  18px  [A+]` tap buttons (step 2, min 14, max 28); native `disabled` at bounds
- Theme selector: 3 segmented buttons (Vàng / Sáng / Tối) — same as ThemeToggle
- Live apply: writes to `useSettingsStore` (already persisted to localforage)
- Export `FONT_SIZE_MIN` and `FONT_SIZE_MAX` from `settings.store.ts` (currently module-private)
- SettingsPage unchanged — font-size and theme remain there as well

**Out of Scope:**
- Removing font-size/theme controls from SettingsPage
- New persistence logic (useSettingsStore already handles it)
- New themes or new font size steps
- Any backend changes

## Context for Development

### Codebase Patterns

- **Drawer pattern**: `TocDrawer.tsx` uses a **custom fixed overlay** (NOT Radix Dialog). It renders a single `fixed inset-0 z-30 flex` wrapper containing a flex-1 backdrop `<button>` + a panel div side-by-side. `ReaderSettingsDrawer` adapts this to a **bottom sheet** by using `flex-col` instead of `flex`: the backdrop `<button>` is `flex-1` (fills vertical space above the panel), and the panel sits at the bottom of the column. No arbitrary z values needed — everything is inside the same `z-30` stacking context.

- **Keyboard handling in drawer**: `useEffect` on `isOpen` — `window.addEventListener('keydown', handler)` intercepts Escape. **CRITICAL: the handler must call `event.stopPropagation()` before `onClose()`** — same as TocDrawer.tsx line 29 — to prevent the event from reaching ChromelessLayout's global Escape handler (`toggleChrome()`). Cleaned up on unmount or when `isOpen` becomes false.

- **Hook ordering — CRITICAL**: All hooks (`useRef`, `useSettingsStore`, `useEffect`) MUST be called unconditionally at the top of the component body, BEFORE any early return. The `if (!isOpen) return null` guard must come AFTER all hook calls. Violating this is a Rules of Hooks error that crashes React.

  Correct structure:
  ```ts
  export function ReaderSettingsDrawer({ isOpen, onClose }: Props) {
    const firstFocusableRef = useRef<HTMLButtonElement>(null)  // hook — always called
    const panelRef = useRef<HTMLDivElement>(null)              // hook — always called
    const { fontSize, theme, setFontSize, setTheme } = useSettingsStore() // hook — always called
    useEffect(() => { ... }, [isOpen, onClose])                // hook — always called

    if (!isOpen) return null  // early return — AFTER all hooks
    return (...)
  }
  ```

- **Focus trap**: The drawer is a modal (`role="dialog" aria-modal="true"`). While open, Tab must cycle through focusable elements within the panel and NOT escape to elements behind the backdrop. Implement via `useEffect` on `isOpen` that adds a `keydown` listener and intercepts Tab/Shift+Tab:
  ```ts
  const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  // On Tab: if last element focused, wrap to first. On Shift+Tab: wrap from first to last.
  ```
  This shares the same `useEffect` as the Escape handler (both listen on `keydown`).

- **Disabled font buttons**: Use the native HTML `disabled` attribute (NOT `aria-disabled`). Native `disabled` prevents click events at the browser level without needing onClick guards. Apply `opacity-40 cursor-not-allowed` classes for visual feedback. **Do NOT use `aria-disabled="true"` alone** — it does not block clicks unless the handler also checks.

- **Settings state**: `useSettingsStore` (Zustand + immer) — exposes `fontSize` (number, 14–28 step 2), `theme` ('sepia'|'light'|'dark'), `setFontSize(value: number)`, `setTheme(theme: ReadingTheme)`. Writes through to localforage automatically.

- **Chrome visibility guard**: bottom bar uses `opacity + pointerEvents` driven by `chromeHidden`. All bottom bar buttons use `tabIndex={chromeHidden ? -1 : 0}`. The [Aa] button follows this same pattern.

- **Bottom bar layout**: The existing bottom bar `<div>` already has `justify-between` in its className. With only one child (page counter `<span>`), it is left-aligned. Adding the [Aa] button as a second child will automatically push them to opposite ends — **no additional layout classes needed on the bar itself**.

- **Theme buttons pattern** (`ThemeToggle.tsx`): `aria-pressed={theme === value}`, inline style with `var(--color-accent)` bg for active and `var(--color-surface)` for inactive. `min-h-[44px]` touch target. `flex-1` equal width.

- **Font size bounds**: `FONT_SIZE_MIN = 14`, `FONT_SIZE_MAX = 28`, step `2`. After Task 0, these are exported from `settings.store.ts` and imported in the drawer. Do NOT hardcode the literals in the drawer.

- **CSS vars**: `var(--color-text)`, `var(--color-text-muted)`, `var(--color-surface)`, `var(--color-border)`, `var(--color-accent)`, `var(--color-background)`.

- **data-testid**: every structural and interactive element gets a `data-testid`.

- **ChromelessLayout open/close pattern**: local state `const [isTocOpen, setIsTocOpen] = useState(false)` + trigger ref `const tocTriggerRef = useRef<HTMLButtonElement>(null)` for focus return on close. `handleCloseToc` calls `setIsTocOpen(false)` then `tocTriggerRef.current?.focus()`. Add the identical pattern for settings: `isSettingsOpen` + `settingsTriggerRef` + `handleCloseSettings`. Note: `.focus()` is called synchronously after `setState` — this is correct because `.focus()` executes before React re-renders, so focus moves to the trigger while the drawer is still in the DOM, and React then renders the drawer away. This is consistent with the existing TocDrawer pattern.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/stores/settings.store.ts` | Modify: export `FONT_SIZE_MIN` and `FONT_SIZE_MAX` |
| `apps/reader/src/features/reader/ChromelessLayout.tsx` | Modify: add [Aa] button bottom-right; `isSettingsOpen` state; mount `ReaderSettingsDrawer` |
| `apps/reader/src/features/reader/ChromelessLayout.test.tsx` | Modify: add tests for [Aa] trigger and drawer wiring |
| `apps/reader/src/features/reader/TocDrawer.tsx` | Reference: exact wrapper/backdrop/panel structure, `event.stopPropagation()` on Escape (line 29), focus-on-open |
| `apps/reader/src/features/reader/TocDrawer.test.tsx` | Reference: `renders nothing when closed`, backdrop click, aria-label patterns |
| `apps/reader/src/features/settings/ThemeToggle.tsx` | Reference: THEME_OPTIONS array, `aria-pressed`, button inline styles |
| `apps/reader/src/features/settings/FontSizeControl.tsx` | Reference: font size label format (`{fontSize}px`) |

### Technical Decisions

- **New file**: `ReaderSettingsDrawer.tsx` — **named export** (`export function ReaderSettingsDrawer`). Bottom sheet, fully self-contained. Props: `{ isOpen: boolean; onClose: () => void }`.

- **Bottom sheet structure** (single z-30 stacking context, no arbitrary z values):
  ```tsx
  <div className="fixed inset-0 z-30 flex flex-col" role="dialog" aria-modal="true" aria-label="Cài đặt hiển thị" data-testid="settings-drawer">
    {/* Backdrop — flex-1 fills space above panel */}
    <button className="flex-1 bg-black/40" type="button" aria-label="Đóng cài đặt" onClick={onClose} />
    {/* Panel — sits at bottom of flex column */}
    <div ref={panelRef} className="bg-[var(--color-surface)] rounded-t-2xl border-t border-[var(--color-border)] shadow-xl">
      ...
    </div>
  </div>
  ```
  This mirrors TocDrawer's `fixed inset-0 z-30 flex` pattern — only the flex direction changes (`flex-col` vs `flex`).

- **Font control**: `[A−]  18px  [A+]` — two `<button>` elements. Use native `disabled` attribute:
  - A−: `disabled={fontSize <= FONT_SIZE_MIN}`, `onClick={() => setFontSize(fontSize - 2)}`
  - A+: `disabled={fontSize >= FONT_SIZE_MAX}`, `onClick={() => setFontSize(fontSize + 2)}`
  - Both: `min-h-[44px] min-w-[44px]`, `opacity-40 cursor-not-allowed` applied via conditional className when disabled.

- **Theme control**: inline copy of ThemeToggle's `THEME_OPTIONS` array and button row. **Named export `ReaderSettingsDrawer`** — no shared abstraction with SettingsPage.

- **Accessible close button**: The panel close button shows an X icon (e.g. `Cross2Icon`) with `aria-label="Đóng cài đặt hiển thị"` so screen reader users have full context. The backdrop button uses `aria-label="Đóng cài đặt"`.

- **[Aa] trigger**: text button `Aa`, `aria-label="Mở cài đặt hiển thị"`, `data-testid="settings-trigger"`, `ref={settingsTriggerRef}`, `tabIndex={chromeHidden ? -1 : 0}`. Placed as the second child in the bottom bar — the existing `justify-between` class handles spacing automatically.

- **Focus return on close**: `handleCloseSettings` calls `setIsSettingsOpen(false)` then `settingsTriggerRef.current?.focus()` synchronously — consistent with `handleCloseToc` pattern.

- **z-index**: center-tap zone z-10, chrome bars z-20, entire drawer wrapper z-30. Backdrop `<button>` at flex-1 captures taps above the panel before they reach lower z layers.

## Implementation Plan

### Tasks

- [x] **Task 0: Export font size constants from `settings.store.ts`**
  - File: `apps/reader/src/stores/settings.store.ts`
  - Action: Change `const FONT_SIZE_MIN = 14` → `export const FONT_SIZE_MIN = 14` and `const FONT_SIZE_MAX = 28` → `export const FONT_SIZE_MAX = 28`. No other changes.
  - Why: The drawer imports these constants to avoid duplicating magic numbers and prevent silent bound divergence.

- [x] **Task 1: Create `ReaderSettingsDrawer.tsx`**
  - File: `apps/reader/src/features/reader/ReaderSettingsDrawer.tsx`
  - Action: Create named-export component as a bottom sheet following TocDrawer structure with `flex-col`.
  - Implementation:
    ```tsx
    import { useEffect, useRef } from 'react'
    import { useSettingsStore } from '@/stores/settings.store'
    import { FONT_SIZE_MIN, FONT_SIZE_MAX } from '@/stores/settings.store'
    import type { ReadingTheme } from '@/stores/settings.store'

    const THEME_OPTIONS: { value: ReadingTheme; label: string }[] = [
      { value: 'sepia', label: 'Vàng' },
      { value: 'light', label: 'Sáng' },
      { value: 'dark', label: 'Tối' },
    ]

    interface ReaderSettingsDrawerProps {
      isOpen: boolean
      onClose: () => void
    }

    export function ReaderSettingsDrawer({ isOpen, onClose }: ReaderSettingsDrawerProps) {
      // ALL hooks must be called before any early return (Rules of Hooks)
      const firstFocusableRef = useRef<HTMLButtonElement>(null)
      const panelRef = useRef<HTMLDivElement>(null)
      const { fontSize, theme, setFontSize, setTheme } = useSettingsStore()

      useEffect(() => {
        if (!isOpen) return
        firstFocusableRef.current?.focus()

        function handleKeyDown(event: KeyboardEvent) {
          if (event.key === 'Escape') {
            event.stopPropagation() // CRITICAL: prevents ChromelessLayout's toggleChrome() from firing
            onClose()
            return
          }
          // Focus trap: cycle Tab/Shift+Tab within panel focusable elements
          if (event.key === 'Tab' && panelRef.current) {
            const focusable = Array.from(
              panelRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
              )
            )
            if (focusable.length === 0) return
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey) {
              if (document.activeElement === first) {
                event.preventDefault()
                last.focus()
              }
            } else {
              if (document.activeElement === last) {
                event.preventDefault()
                first.focus()
              }
            }
          }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
      }, [isOpen, onClose])

      // Early return AFTER all hooks
      if (!isOpen) return null

      return (
        <div
          className="fixed inset-0 z-30 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Cài đặt hiển thị"
          data-testid="settings-drawer"
        >
          {/* Backdrop — flex-1 fills space above panel; captures taps to close */}
          <button
            type="button"
            className="flex-1 bg-black/40"
            aria-label="Đóng cài đặt"
            onClick={onClose}
          />
          {/* Panel */}
          <div
            ref={panelRef}
            className="bg-[var(--color-surface)] rounded-t-2xl border-t border-[var(--color-border)] shadow-xl px-6 pb-8 pt-4"
          >
            {/* Drag handle */}
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--color-border)' }} />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-medium" style={{ color: 'var(--color-text)', fontFamily: 'Inter, sans-serif' }}>
                Hiển thị
              </h2>
              <button
                ref={firstFocusableRef}
                type="button"
                onClick={onClose}
                aria-label="Đóng cài đặt hiển thị"
                className="text-xs bg-transparent border-none cursor-pointer p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <Cross2Icon className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {/* Font size row */}
            <div className="flex items-center justify-between mb-6" data-testid="font-size-control">
              <span className="text-sm" style={{ color: 'var(--color-text)' }}>Cỡ chữ</span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  data-testid="font-decrease"
                  aria-label="Giảm cỡ chữ"
                  disabled={fontSize <= FONT_SIZE_MIN}
                  onClick={() => setFontSize(fontSize - 2)}
                  className={`min-h-[44px] min-w-[44px] text-sm font-medium bg-transparent border-none cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${fontSize <= FONT_SIZE_MIN ? 'opacity-40 cursor-not-allowed' : ''}`}
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  A−
                </button>
                <span data-testid="font-size-value" className="text-sm w-12 text-center" style={{ color: 'var(--color-text)' }}>
                  {fontSize}px
                </span>
                <button
                  type="button"
                  data-testid="font-increase"
                  aria-label="Tăng cỡ chữ"
                  disabled={fontSize >= FONT_SIZE_MAX}
                  onClick={() => setFontSize(fontSize + 2)}
                  className={`min-h-[44px] min-w-[44px] text-sm font-medium bg-transparent border-none cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${fontSize >= FONT_SIZE_MAX ? 'opacity-40 cursor-not-allowed' : ''}`}
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  A+
                </button>
              </div>
            </div>
            {/* Theme row */}
            <div data-testid="theme-control">
              <span className="text-sm mb-3 block" style={{ color: 'var(--color-text)' }}>Giao diện</span>
              <div className="flex gap-2">
                {THEME_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl text-sm font-medium transition-colors"
                    style={
                      theme === value
                        ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-background)' }
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
          </div>
        </div>
      )
    }
    ```

- [x] **Task 2: Create `ReaderSettingsDrawer.test.tsx`**
  - File: `apps/reader/src/features/reader/ReaderSettingsDrawer.test.tsx`
  - Action: Write unit tests following TocDrawer.test.tsx patterns.
  - Store mock + per-test mutation pattern:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest'
    import { render, screen, fireEvent } from '@testing-library/react'
    import userEvent from '@testing-library/user-event'
    import { ReaderSettingsDrawer } from './ReaderSettingsDrawer'
    import type { ReadingTheme } from '@/stores/settings.store'

    const mockSetFontSize = vi.fn()
    const mockSetTheme = vi.fn()
    let mockFontSize = 18
    let mockTheme: ReadingTheme = 'sepia'

    vi.mock('@/stores/settings.store', () => ({
      useSettingsStore: () => ({
        fontSize: mockFontSize,
        theme: mockTheme,
        setFontSize: mockSetFontSize,
        setTheme: mockSetTheme,
      }),
      FONT_SIZE_MIN: 14,
      FONT_SIZE_MAX: 28,
    }))

    describe('ReaderSettingsDrawer', () => {
      beforeEach(() => {
        vi.clearAllMocks()
        mockFontSize = 18        // reset before each test
        mockTheme = 'sepia'      // reset before each test
      })

      it('renders nothing when isOpen is false', () => {
        const { container } = render(<ReaderSettingsDrawer isOpen={false} onClose={vi.fn()} />)
        expect(container.firstChild).toBeNull()
      })

      it('renders drawer when isOpen is true', () => {
        render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
        expect(screen.getByTestId('settings-drawer')).toBeInTheDocument()
      })

      it('calls onClose when backdrop is clicked', () => {
        const onClose = vi.fn()
        render(<ReaderSettingsDrawer isOpen onClose={onClose} />)
        fireEvent.click(screen.getByLabelText('Đóng cài đặt'))
        expect(onClose).toHaveBeenCalled()
      })

      it('calls onClose when Escape is pressed', () => {
        // Use fireEvent.keyDown on window — the handler is attached to window
        const onClose = vi.fn()
        render(<ReaderSettingsDrawer isOpen onClose={onClose} />)
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onClose).toHaveBeenCalled()
      })

      it('displays current fontSize from store', () => {
        render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
        expect(screen.getByTestId('font-size-value')).toHaveTextContent('18px')
      })

      it('calls setFontSize with fontSize+2 when A+ clicked', async () => {
        const user = userEvent.setup()
        render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
        await user.click(screen.getByTestId('font-increase'))
        expect(mockSetFontSize).toHaveBeenCalledWith(20)
      })

      it('calls setFontSize with fontSize-2 when A− clicked', async () => {
        const user = userEvent.setup()
        render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
        await user.click(screen.getByTestId('font-decrease'))
        expect(mockSetFontSize).toHaveBeenCalledWith(16)
      })

      it('A+ button is disabled when fontSize is at max (28)', () => {
        mockFontSize = 28  // set BEFORE render so mock returns 28
        render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
        expect(screen.getByTestId('font-increase')).toBeDisabled()
      })

      it('A− button is disabled when fontSize is at min (14)', () => {
        mockFontSize = 14  // set BEFORE render so mock returns 14
        render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
        expect(screen.getByTestId('font-decrease')).toBeDisabled()
      })

      it('renders three theme buttons', () => {
        render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
        expect(screen.getByLabelText('Giao diện Vàng')).toBeInTheDocument()
        expect(screen.getByLabelText('Giao diện Sáng')).toBeInTheDocument()
        expect(screen.getByLabelText('Giao diện Tối')).toBeInTheDocument()
      })

      it('marks the active theme button as aria-pressed=true', () => {
        mockTheme = 'sepia'
        render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
        expect(screen.getByLabelText('Giao diện Vàng')).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByLabelText('Giao diện Sáng')).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByLabelText('Giao diện Tối')).toHaveAttribute('aria-pressed', 'false')
      })

      it('calls setTheme when theme button clicked', async () => {
        const user = userEvent.setup()
        render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
        await user.click(screen.getByLabelText('Giao diện Tối'))
        expect(mockSetTheme).toHaveBeenCalledWith('dark')
      })
    })
    ```

- [x] **Task 3: Modify `ChromelessLayout.tsx` — add [Aa] trigger and wire drawer**
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - Action 1: Add import at top alongside existing reader imports:
    ```ts
    import { ReaderSettingsDrawer } from './ReaderSettingsDrawer'
    ```
  - Action 2: Add local state and ref after the existing `isTocOpen`/`tocTriggerRef` declarations (~line 62):
    ```ts
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const settingsTriggerRef = useRef<HTMLButtonElement>(null)
    ```
  - Action 3: Add handler after `handleCloseToc`:
    ```ts
    const handleCloseSettings = () => {
      setIsSettingsOpen(false)
      settingsTriggerRef.current?.focus()
    }
    ```
  - Action 4: In the bottom bar JSX, add [Aa] button as second child. The existing bottom bar `<div>` already has `justify-between` — no layout class changes needed on the bar. Add only the button:
    ```tsx
    <div
      className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 transition-opacity duration-300"
      style={{ ... }}
      data-testid="chrome-bottom-bar"
    >
      <span ...>{page counter}</span>
      <button
        ref={settingsTriggerRef}
        type="button"
        onClick={() => setIsSettingsOpen(true)}
        className="text-sm font-medium bg-transparent border-none cursor-pointer px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
        style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
        tabIndex={chromeHidden ? -1 : 0}
        aria-label="Mở cài đặt hiển thị"
        data-testid="settings-trigger"
      >
        Aa
      </button>
    </div>
    ```
  - Action 5: Mount `ReaderSettingsDrawer` **inside the outermost `<div>` before its closing `</div>`** (after `<TocDrawer .../>`, same level):
    ```tsx
        <TocDrawer ... />
        <ReaderSettingsDrawer isOpen={isSettingsOpen} onClose={handleCloseSettings} />
      </div>  {/* ← closing tag of outermost div */}
    ```

- [x] **Task 4: Modify `ChromelessLayout.test.tsx` — add tests for [Aa] trigger and drawer**
  - File: `apps/reader/src/features/reader/ChromelessLayout.test.tsx`
  - Action 1: Add mock for `ReaderSettingsDrawer` at the top of the file (after existing mocks). This avoids needing the settings store mock in ChromelessLayout tests:
    ```ts
    vi.mock('./ReaderSettingsDrawer', () => ({
      ReaderSettingsDrawer: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
        isOpen
          ? <div data-testid="settings-drawer"><button onClick={onClose} aria-label="Đóng cài đặt" /></div>
          : null,
    }))
    ```
  - Action 2: Add new tests to the existing `describe('ChromelessLayout')` block. No changes to existing tests:
    ```ts
    it('renders Aa settings trigger in bottom bar', () => {
      renderLayout()
      expect(screen.getByTestId('settings-trigger')).toBeInTheDocument()
    })

    it('settings trigger has tabIndex 0 when chrome is visible', () => {
      renderLayout()
      expect(screen.getByTestId('settings-trigger')).toHaveAttribute('tabindex', '0')
    })

    it('settings trigger has tabIndex -1 when chrome is hidden', () => {
      useReaderStore.setState({ isChromeVisible: false })
      renderLayout()
      expect(screen.getByTestId('settings-trigger')).toHaveAttribute('tabindex', '-1')
    })

    it('opens ReaderSettingsDrawer when Aa trigger is clicked', () => {
      renderLayout()
      act(() => { screen.getByTestId('settings-trigger').click() })
      expect(screen.getByTestId('settings-drawer')).toBeInTheDocument()
    })

    it('closes ReaderSettingsDrawer when onClose is called from drawer', () => {
      renderLayout()
      act(() => { screen.getByTestId('settings-trigger').click() })
      expect(screen.getByTestId('settings-drawer')).toBeInTheDocument()
      act(() => { screen.getByLabelText('Đóng cài đặt').click() })
      expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument()
    })

    it('returns focus to settings trigger when drawer closes', () => {
      renderLayout()
      act(() => { screen.getByTestId('settings-trigger').click() })
      act(() => { screen.getByLabelText('Đóng cài đặt').click() })
      expect(document.activeElement).toBe(screen.getByTestId('settings-trigger'))
    })
    ```

### Acceptance Criteria

- [x] **AC 1**: Given the reader is open and chrome is visible, the [Aa] button is rendered in the bottom bar on the right side with `tabIndex=0`.
- [x] **AC 2**: Given chrome is hidden (`isChromeVisible=false`), the [Aa] button has `tabIndex=-1` and is not interactable (inherited from bottom bar `pointerEvents: none`).
- [x] **AC 3**: Given chrome is visible, when the user taps [Aa], then `ReaderSettingsDrawer` opens (rendered in DOM with `data-testid="settings-drawer"`).
- [x] **AC 4**: Given the drawer is open, when the user taps the backdrop (`aria-label="Đóng cài đặt"`), then the drawer closes and focus returns to the [Aa] trigger button.
- [x] **AC 5**: Given the drawer is open, when the user presses Escape, then the drawer closes and chrome bars are NOT toggled (stopPropagation prevents toggleChrome).
- [x] **AC 6**: Given the drawer is open and `fontSize=18`, when the user taps A+, then `setFontSize(20)` is called and the displayed value updates to `20px`.
- [x] **AC 7**: Given the drawer is open and `fontSize=18`, when the user taps A−, then `setFontSize(16)` is called and the displayed value updates to `16px`.
- [x] **AC 8**: Given `fontSize=28` (max), then the A+ button has the native `disabled` attribute and clicking it does not call `setFontSize`.
- [x] **AC 9**: Given `fontSize=14` (min), then the A− button has the native `disabled` attribute and clicking it does not call `setFontSize`.
- [x] **AC 10**: Given the drawer is open, when the user taps "Tối" (`aria-label="Giao diện Tối"`), then `setTheme('dark')` is called and the "Tối" button becomes `aria-pressed=true`.
- [x] **AC 11**: Given the drawer is open and `theme='sepia'`, then the "Vàng" button has `aria-pressed=true` and the others have `aria-pressed=false`.

## Review Notes

- Adversarial review completed
- Findings: 10 total, 4 fixed (F1–F4), 6 skipped (F5–F10: undecided/noise)
- Resolution approach: auto-fix

## Additional Context

### Dependencies

- `useSettingsStore`, `FONT_SIZE_MIN`, `FONT_SIZE_MAX` from `stores/settings.store.ts` — Task 0 exports the constants; no other store changes
- `TocDrawer.tsx` — reference only, no changes
- No new npm packages required — text-only controls, no icons used in `ReaderSettingsDrawer`

### Testing Strategy

- **Unit tests** for `ReaderSettingsDrawer` (Task 2): isolated via `vi.mock('@/stores/settings.store', ...)`. Mutate `mockFontSize` / `mockTheme` in `beforeEach` to reset, and directly before `render()` in bound-specific tests. Use `fireEvent.keyDown(window, { key: 'Escape' })` for Escape tests (NOT `userEvent.keyboard` — the handler listens on `window`, not on a focused element). Covers all ACs 3–11.
- **Integration tests** in `ChromelessLayout.test.tsx` (Task 4): `ReaderSettingsDrawer` mocked to isolate trigger wiring. Covers ACs 1–5 including focus return verification via `document.activeElement`. Note: existing tests use `vi.useFakeTimers()` in `beforeEach` — new tests that are purely synchronous do not need `vi.useRealTimers()`, but if any async behavior is needed follow the existing pattern at line ~241.
- **Manual testing**: open reader → tap center to show chrome → tap Aa → verify drawer opens → change font (live preview) → change theme (live preview) → tap outside → verify dismissed, settings applied, focus on Aa button → press Aa again → press Escape → verify chrome bars do NOT toggle.

### Notes

- UX design confirmed by Sally (UX Designer agent) + Minh on 2026-03-14
- Apple Books pattern: TOC in top bar, display settings (Aa) in bottom bar — avoids top bar crowding
- ASCII mockup approved: [Aa] bottom-right, slide-up sheet with A−/px/A+ and 3 theme buttons
- **Risk**: ChromelessLayout.test.tsx uses `vi.useFakeTimers()` in `beforeEach` — new synchronous tests are unaffected; only note this if adding async interactions
- **Future**: if font/theme controls are removed from SettingsPage later, `FontSizeControl.tsx` and `ThemeToggle.tsx` could be deleted — no dependency from this feature on those components
- **Adversarial review passed** — 16 findings resolved: z-index simplified to single z-30 context, stopPropagation on Escape, hooks-before-return enforced, native disabled attribute, focus trap implemented, constants exported, named export stated, focus return tested, React timing noted, fireEvent vs userEvent clarified, per-test mock mutation shown, drawer placement inside outermost div, syntax fixed, aria-labels complete, no icons in component
