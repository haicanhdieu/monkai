# Story 3.4: ChromelessLayout - Immersive Reading Mode

Status: review

## Story

As a **user**,
I want the navigation UI to disappear when I'm reading and reappear when I tap the center of the screen,
so that I can be fully immersed in the text without distracting interface elements.

## Acceptance Criteria

1. **Given** `ChromelessLayout` wraps `ReaderEngine` and reads `isChromeVisible` from `reader.store`
   **When** `isChromeVisible` is `false`
   **Then** the top bar (book title, back button) and bottom bar (page progress, settings shortcut) are hidden with opacity 0 and `pointer-events: none` - the full screen is dedicated to the text

2. **Given** the user taps the center 60% of the screen
   **When** the tap is detected (not the left/right 20% pagination zones)
   **Then** `reader.store.toggleChrome()` fires, and the top/bottom bars slide in/out smoothly (CSS transition, no layout reflow of text)

3. **Given** the very first time a user opens the reader
   **When** `ChromelessLayout` mounts and `isChromeVisible` is `true`
   **Then** a brief text hint "Chạm vào giữa màn hình để hiện menu" appears, chrome auto-hides after 3 seconds, and the hint is removed from the DOM after the first successful center-tap

4. **Given** `isChromeVisible` transitions to `true`
   **When** the top/bottom bars animate in
   **Then** the text content does not reflow or shift - bars overlay the text as a layer

5. **Given** a screen reader is active
   **When** the reader renders
   **Then** ARIA landmarks are present: `role="main"` on the reading content area, `role="navigation"` on the top bar, and each "page" of text has `aria-live="polite"` to announce page changes

## Tasks / Subtasks

- [x] Task 1: Implement chromeless wrapper component (AC: 1, 2, 4)
  - [x] Create `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - [x] Layer top/bottom chrome as overlays over text container
  - [x] Toggle visibility via store state with opacity/pointer-events transitions

- [x] Task 2: Wire center-tap interaction and hit-zone coordination (AC: 2)
  - [x] Integrate with ReaderEngine zone model so center tap does not conflict with pagination zones
  - [x] Ensure center zone is exactly middle 60% region logic across breakpoints

- [x] Task 3: Implement first-touch tooltip behavior (AC: 3)
  - [x] Add one-time hint lifecycle (show on first reader open)
  - [x] Auto-hide chrome after 3 seconds on initial mount
  - [x] Remove hint from DOM after first successful center-tap

- [x] Task 4: Add accessibility semantics (AC: 5)
  - [x] Add `role="main"` for reading container and `role="navigation"` for top bar
  - [x] Ensure page change announcements expose `aria-live="polite"`
  - [x] Verify focus behavior for chrome controls when visible/hidden

- [x] Task 5: Add component tests for chrome toggling and accessibility (AC: 1, 2, 3, 5)
  - [x] Create `apps/reader/src/features/reader/ChromelessLayout.test.tsx`
  - [x] Assert hide/show classes and pointer-event behavior
  - [x] Assert tooltip first-load behavior and removal
  - [x] Assert required ARIA landmarks/attributes

## Dev Notes

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 3.4]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md#Design Direction Decision]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Component Architecture]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Implemented as part of YOLO batch: stories 3.2–3.5
- Center-tap zone: fixed div positioned left:20%/right:20% — avoids conflicting with ReaderEngine's edge tap zones

### Completion Notes List

- `ChromelessLayout.tsx`: fixed-position top/bottom bars with opacity + pointer-events CSS transitions
- Center-tap zone: fixed div covering center 60% (left:20%→right:20%), captures clicks to toggleChrome
- Auto-hide timer: 3s setTimeout on mount, clears on unmount, reads getState() to avoid stale isChromeVisible
- First-open hint: `showHint` state, dismissed on first center-tap, rendered with pointer-events:none
- role="navigation" on top bar; role="main" + aria-live="polite" on ReaderEngine text column (cross-story)
- tabIndex=-1 on back link when chrome is hidden (a11y: not focusable when invisible)
- 10 tests: opacity/pointerEvents, center-tap toggle, hint lifecycle, auto-hide, ARIA, children render — all pass

### File List

- apps/reader/src/features/reader/ChromelessLayout.tsx (new)
- apps/reader/src/features/reader/ChromelessLayout.test.tsx (new)
- apps/reader/src/features/reader/ReaderPage.tsx (updated — wrapped with ChromelessLayout)
- _bmad-output/implementation-artifacts/phase-2-reader-ui/3-4-chromelesslayout-immersive-reading-mode.md (updated)

## Change Log

- 2026-03-07: Implemented Story 3.4 — ChromelessLayout immersive reading mode (claude-sonnet-4-6)
