---
title: 'Reader: Add Table of Contents (TOC)'
slug: 'reader-add-toc'
created: '2026-03-13'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'Vite 7', 'TypeScript', 'epub.js 0.3.x', 'Zustand', 'Tailwind', 'Vitest', '@testing-library/react']
files_to_modify: ['apps/reader/src/features/reader/useEpubReader.ts', 'apps/reader/src/features/reader/ReaderEngine.tsx', 'apps/reader/src/features/reader/ChromelessLayout.tsx', 'apps/reader/src/features/reader/ReaderPage.tsx', 'apps/reader/src/features/reader/TocList.tsx', 'apps/reader/src/features/reader/TocDrawer.tsx']
code_patterns: ['epub.js only in useEpubReader', 'data-testid for key UI', 'Vietnamese UI strings', 'Tailwind + CSS variables', 'optional callback props for TOC']
test_patterns: ['Vitest describe/it', 'render + screen + expect', 'vi.mock for hooks and services', 'data-testid selectors', 'MemoryRouter for routes']
---

# Tech-Spec: Reader: Add Table of Contents (TOC)

**Created:** 2026-03-13

## Overview

### Problem Statement

Readers have no way to jump to chapters or sections from a table of contents. The reader uses epub.js and shows only paginated content with top/bottom chrome (back, title, page progress). Books (including Buddhist texts with many chapters) need a discoverable, accessible TOC for navigation.

### Solution

Add a TOC surface driven by epub.js `book.navigation.toc`, resolve each entry to a navigable target (CFI or resolved href), and navigate via `rendition.display(target)`. Expose TOC from the reader chrome as a left drawer with trigger in the top bar (per product decision), with UI that follows common ebook-reader and accessibility patterns.

### Scope

**In Scope:**
- Consume epub.js navigation (TOC from `book.navigation.toc`) when available. Landmarks are out of scope for v1.
- Resolve TOC hrefs to spine-compatible targets (including fragment `#id`) and navigate on item click (close TOC and jump).
- TOC UI: flat list of entries only (no nested expand/collapse in v1); keyboard and screen-reader friendly.
- Integrate TOC trigger and left drawer into the existing reader chrome (ChromelessLayout).
- Graceful behavior when navigation is empty (show trigger; drawer shows "Không có mục lục") and when getToc fails (drawer error state or close).

**Out of Scope:**
- Editing or generating TOC in the EPUB/JSON pipeline.
- Page-list / page-based TOC (pageList) unless we add it in a follow-up.
- Syncing reading position back into TOC highlight (current chapter) — can be a follow-up.

---

## Research Summary

### epub.js TOC / Navigation API

- **Source:** `book.navigation` (type `Navigation`). Available after the book is opened; `book.loaded.navigation` is a Promise if async access is needed.
- **Structures (from `epubjs` types):**
  - `NavItem`: `{ id: string, href: string, label: string, subitems?: NavItem[], parent?: string }`
  - `Navigation.toc`: `Array<NavItem>` (tree via `subitems`).
  - `Navigation.landmarks`: `Array<LandmarkItem>` (optional; `href`, `label`, `type`).
- **Important:** TOC `href` values are often relative to the **nav document** path (or NCX), while `book.spine.get(target)` resolves relative to the **OPF** (package). Path resolution may be required: resolve `href` against `book.packaging.navPath` or `book.packaging.ncxPath` (or OPF base) to get a spine-compatible path. See e.g. [epub.js #986](https://github.com/futurepress/epub.js/issues/986), [#1084](https://github.com/futurepress/epub.js/issues/1084).
- **Navigation:** `rendition.display(target)` accepts CFI string or (per spine) section identifier. Flow options:
  1. **Preferred:** Resolve TOC href to a path spine understands, then `rendition.display(resolvedPath)` if spine.get(resolvedPath) works.
  2. **Fallback:** Resolve href → get `Section` via `book.spine.get(resolvedPath)` → `section.load(book.load.bind(book))` → get CFI from `section.cfiFromElement(element)` (body or `getElementById(fragmentId)`), then `rendition.display(cfi)`.
- **EPUBs built from JSON:** `bookToEpub` / minimal EPUB 2.0 may not emit a nav document; in that case `book.navigation.toc` may be empty. UI must handle empty TOC (hide control or show empty state).

### UI/UX Best Practices (TOC in ebook readers)

- **Two layers:** Visible TOC list + backend structure (NCX/nav). We rely on epub.js to parse nav/NCX; no extra backend beyond that.
- **Scannable and direct:** Clear hierarchy, direct jump on tap/click; avoid overwhelming with a single long flat list (use expand/collapse for nested items).
- **Toggle / progressive disclosure:** Expandable sections reduce clutter on small screens (e.g. [Nielsen Norman Group](https://www.nngroup.com/articles/table-of-contents/)).
- **Accessibility:** Keyboard focus, focus trap in overlay/drawer, ARIA labels (e.g. “Mục lục”), list semantics, and “current” or “active” chapter if we add highlight later.
- **Placement patterns:** Side drawer (left edge), top-bar icon opening overlay/modal, or bottom sheet. Choice affects chrome layout and mobile vs desktop.

---

## Context for Development

### Codebase Patterns

- **epub.js boundary:** Only `useEpubReader.ts` may import from `epubjs`. All other code uses the hook’s return value (`containerRef`, `rendition`, `book`, `isReady`, `error`). TOC data and navigation will use `book` and `rendition` from the hook; no new epub.js imports outside the hook.
- **Reader chrome:** `ChromelessLayout` owns top bar (back, title), bottom bar (page progress), center-tap zone (toggle chrome). `ReaderEngine` owns the epub.js container and event wiring (click, keyup, relocated). TOC trigger can live in the top bar (new button) or as a dedicated control; TOC panel can be a drawer/overlay rendered by ChromelessLayout or a shared reader component that receives `book`/`rendition` as props.
- **Navigation already in use:** `ReaderEngine` calls `rendition.display(initialCfi)` and `rendition.display(saved.cfi)` for resume/bookmark; same API for TOC jumps.
- **State:** Zustand stores in `stores/`; no new store required for TOC unless we persist “TOC open/closed” or expand state (optional; can be local component state).
- **i18n:** Vietnamese UI strings; e.g. “Mục lục” for TOC, “Không có mục lục” for empty state.
- **Styling:** Tailwind + CSS variables (e.g. `var(--color-surface)`, `var(--color-text)`); match existing reader chrome.

### Files to Reference

| File | Purpose |
|------|--------|
| `apps/reader/src/features/reader/useEpubReader.ts` | Hook that owns epub.js lifecycle; returns `book`, `rendition`. TOC data comes from `book.navigation` (only place that may touch epub.js API for nav). |
| `apps/reader/src/features/reader/ReaderEngine.tsx` | Renders epub container; has `rendition` and uses `rendition.display(cfi)`. Can pass `book`/`rendition` to a TOC component or parent can own TOC and pass navigation handler. |
| `apps/reader/src/features/reader/ChromelessLayout.tsx` | Top/bottom chrome, center tap. Natural place for TOC trigger (e.g. top bar) and TOC panel (drawer/overlay). |
| `apps/reader/src/features/reader/ReaderPage.tsx` | Composes layout + engine; may pass callbacks or render TOC container. |
| `apps/reader/src/shared/lib/bookToEpub.ts` | JSON→EPUB; currently may not emit nav; explains empty TOC for some books. |
| `_bmad-output/project-context.md` | Reader EPUB flow, storage, structure, i18n. |
| `apps/reader/node_modules/epubjs/types/navigation.d.ts` | NavItem, Navigation API. |
| `apps/reader/node_modules/epubjs/types/book.d.ts` | book.navigation, book.loaded.navigation. |
| `apps/reader/src/features/reader/ChromelessLayout.test.tsx` | Test patterns: renderLayout(book), data-testid, useReaderStore.getState. |
| `apps/reader/src/features/reader/ReaderEngine.test.tsx` | Mocks: useEpubReader, storageService; tests for loading, error, a11y. |

### Technical Decisions

- **TOC data source:** Use `book.navigation.toc` only (landmarks and pageList out of scope for v1).
- **Href → display:** Resolve each TOC href once in `getToc()`: resolve path against navPath/ncxPath, strip or retain fragment `#id` per spine API; store resolved path (and fragment if needed) in the normalized entry so `navigateToTocEntry(entry)` uses `entry.href` as the spine target without re-resolving. If `rendition.display(entry.href)` fails, fallback: section.load + cfiFromElement(body or getElementById(fragment)) + display(cfi). All logic inside `useEpubReader`; no epub.js imports elsewhere.
- **Empty TOC:** Per product decision **B** — show TOC trigger always; when opened with no entries, panel shows "Không có mục lục".
- **Data flow (Step 2 finding):** Lift `useEpubReader` from ReaderEngine to ReaderPage so ReaderPage can pass `getToc` and `navigateToTocEntry` to ChromelessLayout. ReaderEngine will accept `containerRef`, `rendition`, `book` (epub.js), `isReady`, `error` plus existing `bookId`, `bookTitle`, `initialCfi` as props. ReaderEngine must guard all use of `rendition`/`book` on non-null (e.g. early return or skip effects when `!rendition || !book`) so loading/error states do not throw. ChromelessLayout receives optional `getToc` and `navigateToTocEntry`; when both present, top bar shows TOC trigger and left drawer. **Focus:** When the drawer closes (after select or dismiss), return focus to the TOC trigger button so keyboard users can reopen or tab to reader.
- **New files:** `TocDrawer.tsx` (drawer shell, empty state, uses TocList), `TocList.tsx` (flat list of entries, keyboard/ARIA). Normalized TOC entry type `{ label: string, href: string }` defined in reader feature (no epub.js type in layout).

---

## Implementation Plan

**Step 2 refinements:** Data flow = lift useEpubReader to ReaderPage; ReaderEngine receives containerRef/rendition/book/isReady/error as props. New files: TocList.tsx, TocDrawer.tsx. Normalized entry type `{ label: string, href: string }`; getToc/navigateToTocEntry from useEpubReader only.

### Task checklist (implementation order)

- [x] **Task 1: useEpubReader TOC API**
  - File: `apps/reader/src/features/reader/useEpubReader.ts`
  - Action: Add getToc() returning Promise<{ label: string, href: string }[]> (flatten book.navigation.toc; for each entry resolve href against book.packaging.navPath/ncxPath to a spine-compatible path; include fragment #id in href if present so navigateToTocEntry can use it). Add navigateToTocEntry(entry) that calls rendition.display(entry.href) (entry.href is already resolved; no re-resolution). If display fails, fallback: section.load + cfiFromElement(body or getElementById(fragment)) + display(cfi). Extend UseEpubReaderResult with getToc and navigateToTocEntry.
  - Notes: No new epub.js imports; all nav/spine logic stays in this file. Return empty array when navigation.toc missing or empty. Resolve path and fragment once in getToc so navigateToTocEntry is idempotent.

- [x] **Task 2: Lift useEpubReader to ReaderPage**
  - File: `apps/reader/src/features/reader/ReaderPage.tsx`
  - Action: Call useEpubReader(epubUrl); pass to ChromelessLayout: book (app Book), getToc, navigateToTocEntry; pass to ReaderEngine: containerRef, rendition, book (epub.js), isReady, error, bookId, bookTitle, initialCfi.
  - Notes: ChromelessLayout and ReaderEngine signatures change as below.
  - File: `apps/reader/src/features/reader/ReaderEngine.tsx`
  - Action: Remove useEpubReader(epubUrl). Accept props containerRef, rendition, book, isReady, error, bookId, bookTitle, initialCfi. Guard all use of rendition/book: when rendition or book is null (e.g. loading), skip theme/fontSize effects and do not attach click/keyup/relocated or call display(); when isReady and non-null, keep existing theme, fontSize, click, keyup, relocated, resume logic.
  - Notes: ReaderEngine no longer owns epub lifecycle; it receives it from parent. Prevents runtime errors when props are null during load.

- [x] **Task 3: TocList component**
  - File: `apps/reader/src/features/reader/TocList.tsx` (new)
  - Action: Create presentational component with props entries: { label, href }[], onSelect(entry), onClose. Render flat ul/li; each entry a button. ARIA role="navigation", aria-label="Mục lục". Keyboard: Enter/Space activate; Escape calls onClose.
  - Notes: data-testid="toc-list"; Vietnamese label "Mục lục".

- [x] **Task 4: TocDrawer component**
  - File: `apps/reader/src/features/reader/TocDrawer.tsx` (new)
  - Action: Left slide-over drawer with header "Mục lục" and close button. Content: entries.length > 0 ? TocList : "Không có mục lục"; support loading state (getToc in progress) and error state (getToc rejected). Focus trap when open; on close, return focus to the element that opened the drawer (TOC trigger). Style with Tailwind and CSS variables to match chrome.
  - Notes: data-testid="toc-drawer"; accept entries, onSelect, onClose, isLoading?, error?; overlay click and Escape dismiss.

- [x] **Task 5: ChromelessLayout TOC trigger and drawer**
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - Action: Add optional props getToc?: () => Promise<{ label, href }[]>, navigateToTocEntry?: (entry) => Promise<void>. When both provided: show TOC trigger in top bar (right side, "Mục lục" or list icon). On trigger click open TocDrawer; call getToc() and show loading in drawer until it resolves; populate entries or show error/empty state. On entry select call navigateToTocEntry(entry) then close drawer. On close (select or dismiss), return focus to the TOC trigger button. Dismiss via overlay or Escape.
  - Notes: data-testid="toc-trigger"; only show trigger when both getToc and navigateToTocEntry are provided.

- [x] **Task 6: Empty TOC and error handling**
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx` (and TocDrawer)
  - Action: Per decision B: when getToc/navigateToTocEntry provided, always show TOC trigger; when getToc() returns [], drawer shows "Không có mục lục". When getToc() rejects, drawer shows a short error state (e.g. "Không tải được mục lục") and close button (or close automatically after message). When navigateToTocEntry rejects, close drawer anyway and return focus to trigger (optional log/toast).
  - Notes: No blocking UI; user can always close the drawer.

- [x] **Task 7: Tests**
  - File: `apps/reader/src/features/reader/useEpubReader.test.ts` (new or extend)
  - Action: Unit tests for getToc (mock book.navigation.toc, packaging.navPath) and navigateToTocEntry (mock rendition.display).
  - File: `apps/reader/src/features/reader/TocList.test.tsx`, `TocDrawer.test.tsx` (new)
  - Action: Component tests: TocList render, onSelect/onClose; TocDrawer empty vs list, close behavior.
  - File: `apps/reader/src/features/reader/ChromelessLayout.test.tsx`
  - Action: With getToc/navigateToTocEntry provided, assert TOC trigger visible; open drawer shows list or "Không có mục lục" when getToc returns [].
  - Notes: ReaderPage.test and ReaderEngine.test: adjust mocks for new props (ReaderEngine receives rendition/book etc; ChromelessLayout receives getToc/navigateToTocEntry). Create `useEpubReader.test.ts` if it does not exist (do not assume "extend" only).

### Acceptance Criteria

1. **Given** an open book with a non-empty `book.navigation.toc`  
   **When** the user activates the TOC trigger in the reader chrome  
   **Then** a TOC panel opens showing the flat list of entries (labels).

2. **Given** the TOC panel is open  
   **When** the user selects a TOC entry  
   **Then** the reader navigates to that location (`rendition.display`), the TOC panel closes, and focus returns to the TOC trigger button.

3. **Given** an open book with empty or missing `book.navigation.toc`  
   **When** the user is on the reader screen  
   **Then** the TOC trigger is visible (per decision B); when the user opens the TOC panel, it shows "Không có mục lục" (no list).

4. **Given** the TOC panel is open  
   **When** the user dismisses the panel (e.g. overlay click, Escape, or back)  
   **Then** the panel closes without navigating.

5. **Given** the TOC panel  
   **When** the user uses keyboard only  
   **Then** the trigger is focusable, the panel is reachable and focusable, and entry selection works with Enter/Space; Escape closes the panel.

6. **Given** any TOC entry (v1: flat list only; nested subitems ignored)  
   **When** the user selects an entry  
   **Then** the reader navigates to that location and the panel closes.

7. **Given** the TOC drawer is open  
   **When** getToc() rejects (e.g. book destroyed or navigation parse failed)  
   **Then** the drawer shows an error state (e.g. "Không tải được mục lục") and the user can close it; focus returns to the TOC trigger on close.

8. **Given** the TOC drawer has just closed (after select or dismiss)  
   **When** focus was previously on the trigger or inside the drawer  
   **Then** focus returns to the TOC trigger button so keyboard users can reopen or tab away.

---

## Product Decisions (Confirmed)

**Chosen:** (1) **A** — Left drawer, trigger in top bar. (2) **B** — Show trigger; empty panel shows "Không có mục lục". (3) **C** — Flat list only. (4) Highlight: follow-up.

_Original options (reference):_ Please decide the following so the spec can be finalized and marked “Ready for Development”:

1. **TOC placement**
   - **A)** Drawer from the **left edge** (slide-over) when user taps a “Mục lục” or list icon in the **top bar** (e.g. right side of the title bar).
   - **B)** **Top bar** icon that opens a **modal/overlay** (centered or full-screen list) instead of a drawer.
   - **C)** **Bottom sheet** (slide up from bottom) for mobile-first; trigger in top or bottom bar.
2. **Empty TOC**
   - **A)** **Hide** the TOC trigger entirely when there are no TOC entries.
   - **B)** **Show** the trigger but open the panel with a short message like “Không có mục lục” (and no list).
3. **Nested chapters (subitems)**
   - **A)** **Collapsed by default**; user expands to see children (reduces clutter).
   - **B)** **Expanded by default**; user can collapse (see full structure at a glance).
   - **C)** **Always flat** for v1 (ignore `subitems` and show a single-level list).
   - Which do you prefer?

4. **Current chapter highlight**
   - **In scope for v1?** Should we highlight the “current” TOC entry based on current CFI (e.g. compare `rendition.currentLocation()` or `readerStore.currentCfi` to TOC entry targets)? This requires storing a CFI per TOC entry and comparing on open/relocated.  
   - **Yes** → add task and AC for “current entry is visually indicated.”  
   - **No** → leave for a follow-up.

Once you answer these, the spec will be updated with the chosen options and any small task/AC tweaks, and we can proceed to Step 2 (deep investigation) or you can go straight to implementation from this spec.

---

## Additional Context

### Dependencies

- epub.js 0.3.x (already in use); no new runtime deps. Types: `NavItem`, `Navigation` from `epubjs` (only in useEpubReader). Landmarks and pageList are not used in v1.

### Testing Strategy

- Unit tests for getToc (href resolution, packaging.navPath) and navigateToTocEntry with mocked book/rendition.
- Component tests for TocList (render, onSelect, onClose), TocDrawer (empty, list, loading, error, focus return), ChromelessLayout (trigger visible when props provided, drawer list/empty/error).
- Optional E2E: open book → open TOC → select entry → assert navigation.

### Notes

- **Risk:** TOC href path resolution (nav vs OPF-relative) can fail on some EPUBs; fallback to section.load + cfiFromElement + display(cfi) keeps navigation working when spine.get(href) fails.
- JSON-built EPUBs (no pre-built `epubUrl` in catalog) may have no nav document; `bookToEpub` could be extended later to emit a minimal nav for TOC (out of scope here).
- **Future:** Current chapter highlight in TOC (compare current CFI to entry targets) is a follow-up; not in v1 scope.
