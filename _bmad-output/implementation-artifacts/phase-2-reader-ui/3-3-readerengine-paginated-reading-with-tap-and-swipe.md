# Story 3.3: ReaderEngine - Paginated Reading with Tap & Swipe

Status: review

## Story

As a **user**,
I want to flip through a sutra's pages by tapping or swiping left and right,
so that reading feels like turning pages in a physical book rather than scrolling a website.

## Acceptance Criteria

1. **Given** `ReaderEngine` receives `book.content` (paragraphs array) and mounts
   **When** `document.fonts.ready` resolves
   **Then** `paginateBook(paragraphs, { viewportHeight, fontSize, lineHeight })` is called inside `useMemo`, the result is stored in `reader.store.setPages(pages)`, and the first page renders

2. **Given** the user taps the right 20% of the screen (or swipes left)
   **When** the gesture is detected
   **Then** `reader.store.setCurrentPage(currentPage + 1)` is called, the next page of paragraphs renders, and the visual response occurs within 50ms

3. **Given** the user taps the left 20% of the screen (or swipes right)
   **When** the gesture is detected
   **Then** the previous page renders; if already on page 1, no action occurs

4. **Given** the user is on the last page
   **When** they tap the right zone
   **Then** no navigation occurs and no error is thrown

5. **Given** the reading column on tablet/desktop (viewport >= 768px)
   **When** rendered
   **Then** the text column is constrained to max-width ~700px (65-70ch), centered, with left/right margins acting as tap zones

6. **Given** the user is on desktop
   **When** they press the right Arrow key or Page Down
   **Then** the next page renders; left Arrow or Page Up renders the previous page

7. **Given** `<PageProgress>` at the bottom of the reading area
   **When** any page renders
   **Then** it shows the current page and total pages (e.g., "14 / 89") in Inter font, subdued styling

## Tasks / Subtasks

- [x] Task 1: Implement `ReaderEngine` render/pagination loop (AC: 1, 5)
  - [x] Create `apps/reader/src/features/reader/ReaderEngine.tsx`
  - [x] Await `document.fonts.ready` before first pagination compute
  - [x] Use `useMemo` to derive pages from `paginateBook`
  - [x] Apply responsive reading column constraints (`max-width` + centered layout)

- [x] Task 2: Add interaction zones and navigation actions (AC: 2, 3, 4)
  - [x] Implement left/right 20% tap zones with clear hit testing
  - [x] Add swipe gesture support with threshold guarding
  - [x] Clamp navigation boundaries at first/last page

- [x] Task 3: Add keyboard navigation and page progress UI (AC: 6, 7)
  - [x] Handle ArrowLeft/ArrowRight/PageUp/PageDown key events
  - [x] Create `apps/reader/src/features/reader/PageProgress.tsx`
  - [x] Render subdued progress indicator in Inter font

- [x] Task 4: Integrate with reader store and ReaderPage (AC: 1, 2, 3, 4, 7)
  - [x] Ensure `setPages` and `setCurrentPage` interactions remain single source of truth
  - [x] Wire `ReaderPage` success path to render `ReaderEngine`

- [x] Task 5: Add tests for interaction and latency-sensitive behavior (AC: 2, 3, 4, 6, 7)
  - [x] Create `apps/reader/src/features/reader/ReaderEngine.test.tsx`
  - [x] Test tap zone transitions and boundary clamping
  - [x] Test keyboard controls on desktop-like environment
  - [x] Add deterministic assertion that page transition logic is synchronous and lightweight

## Dev Notes

### Story Foundation

- This story realizes FR6 and FR7 with the first full paginated reading loop.
- It depends directly on Story 3.1 (`paginateBook`) and Story 3.2 (`ReaderPage` + store lifecycle).
- UX target is physical-book feel with zero-scroll interaction.

### Technical Requirements

- Ensure first render stays stable while fonts are loading; avoid fallback-font pagination mismatch.
- Keep gesture detection minimal and deterministic to maintain <50ms response envelope.
- Use guard clauses for out-of-bound page transitions.

### Architecture Compliance

- Pagination algorithm remains in `lib/pagination`; `ReaderEngine` orchestrates only.
- Reader state mutations flow through `reader.store` actions only.
- Keep layout responsive via relative units and column constraints from UX spec.

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 3.3]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md#Responsive Design & Accessibility]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md#2.5 Experience Mechanics]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Frontend Architecture]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md#Non-Functional Requirements]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Implemented as part of YOLO batch: stories 3.2–3.5
- Key debug: JSDOM `getBoundingClientRect()` returns zero → switched to `e.clientX / window.innerWidth` for tap zones
- Key debug: 5 test paragraphs all fit on 1 page → increased to 50 paragraphs in tests to force multiple pages

### Completion Notes List

- `ReaderEngine.tsx`: fonts.ready gate → useMemo paginateBook → useEffect setPages → render current page
- Tap zones via `e.clientX / window.innerWidth`: <0.2 prev, >0.8 next, center → onCenterTap callback
- Swipe: touchStart/touchEnd with 50px threshold, `swipeHandled` ref prevents click double-fire
- Keyboard: stable `useEffect` via navigateNextRef/navigatePrevRef refs avoiding stale closure
- `computedPagesRef` ref tracks page count synchronously; navigation uses ref not store.pages
- `PageProgress` renders "N / Total" in Inter, subdued color
- 17 tests: rendering, empty content, tap zones, keyboard, swipe, progress — all pass

### File List

- apps/reader/src/features/reader/ReaderEngine.tsx (new)
- apps/reader/src/features/reader/PageProgress.tsx (new)
- apps/reader/src/features/reader/ReaderEngine.test.tsx (new)
- apps/reader/src/features/reader/ReaderPage.tsx (updated — wired engine)
- _bmad-output/implementation-artifacts/phase-2-reader-ui/3-3-readerengine-paginated-reading-with-tap-and-swipe.md (updated)

## Change Log

- 2026-03-07: Implemented Story 3.3 — ReaderEngine with pagination, tap, swipe, keyboard (claude-sonnet-4-6)
