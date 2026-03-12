---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
workflowType: 'prd'
classification:
  projectType: Progressive Web App / Static Frontend
  domain: Religion & Spirituality / Education Technology
  complexity: Medium
  projectContext: brownfield
inputDocuments:
  - _bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md
  - _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md
  - _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md
  - _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md
readerImplementation: 'epub.js'
epubJsRepository: 'https://github.com/futurepress/epub.js'
---

# Product Requirements Document — Reader UI (epub.js)

**Author:** Minh  
**Date:** 2026-03-11

---

## Executive Summary

This PRD defines a **small update to the Monkai Phase 2 Reader**: the reader experience is implemented using **[epub.js](https://github.com/futurepress/epub.js)** instead of a custom-built pagination engine. Product goals, user journeys, success criteria, and functional scope remain aligned with the existing [Reader UI PRD](_bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md); only the **reader implementation approach** changes.

Monkai remains an offline-first PWA for reading Buddhist texts with a fast, distraction-free, paginated experience. By adopting epub.js we leverage a mature, widely used library for EPUB rendering, pagination, and navigation—reducing custom code and maintenance while preserving the same user-facing behavior (page-turn navigation, themes, progress persistence, offline support).

### What Changes

- **Reader engine:** Custom pagination engine (`paginateBook` + DOM rendering) is replaced by **epub.js** for rendering and page/location handling.
- **Content format:** The reader supports **EPUB** as the primary format consumed by epub.js. Existing Phase 1 JSON-based content can be converted to EPUB (build-time or at ingest) or served alongside EPUB; the catalog and library UX stay the same.
- **Rest of product:** Unchanged—PWA shell, library discovery, search, offline caching, storage abstraction, themes, font size, bookmarks, and resume-from-last-position all remain as specified in the existing Reader UI PRD and epics.

### What Stays the Same

- Same target users (devoted practitioner, curious beginner).
- Same success criteria (instant access, uninterrupted reading, focus and comfort, zero backend, performance and a11y targets).
- Same user journeys (open app → browse/search → read with page flip → progress saved; offline-first).
- Same non-reader features: categories, global search, settings, bookmarks, installable PWA, Service Worker strategy.

---

## Project Classification

**Project Type:** Progressive Web App / Static Frontend  
**Domain:** Religion & Spirituality / Education Technology  
**Complexity:** Medium  
**Project Context:** Brownfield (Reader UI already specified; this is a library swap within Phase 2.)

---

## Success Criteria

*Aligned with existing Reader UI PRD.*

### User Success

- **Instant Access:** PWA loads quickly; users can start reading without unnecessary delay.
- **Uninterrupted Reading:** Offline access to downloaded content; reading remains stable when offline.
- **Focus and Comfort:** Distraction-free, legible UI across Mobile, Tablet, and Desktop.

### Business Success

- **Zero Backend:** Static hosting (e.g. GitHub Pages) with no operational backend cost.
- **Scalability:** Static architecture supports high concurrency without extra infrastructure.

### Technical Success

- **Performance:** Lighthouse PWA and Performance scores ≥ 90 where applicable; page turns feel instantaneous (target &lt; 50ms response).
- **Efficient rendering:** epub.js handles rendering and pagination; integration must not block the UI thread (e.g. locations generation or loading handled appropriately).
- **Cross-platform:** Installable PWA on iOS (Safari) and Android (Chrome); reader works in supported browsers.

### Measurable Outcomes

- Time to Interactive (TTI) &lt; 2 seconds after shell/cache is ready.
- Core reading features (open book, page turn, progress, themes) work offline.

---

## Product Scope

### MVP (Reader with epub.js)

- **PWA & app shell:** Unchanged from existing Reader UI (Vite + React, Service Worker, routing, bottom nav).
- **Library & search:** Unchanged (browse categories, list sutras, global search with MiniSearch).
- **Reader:** Implemented with **epub.js**:
  - Load and render EPUB content (or content exposed as EPUB).
  - Paginated or continuous flow as per UX spec (paginated page-turn experience preferred).
  - Tap/swipe left and right for page navigation; keyboard (arrows, Page Up/Down) on desktop.
  - Chromeless layout: center-tap toggles chrome; left/right zones for page turn.
- **Progress & persistence:** Reading position (e.g. CFI or location) saved via existing StorageService; resume from last position on reopen.
- **Themes & font size:** Apply existing theme (Sepia/Light/Dark) and font-size preferences to the epub.js viewer container/CSS.
- **Offline:** Service Worker caches app shell and book assets (EPUBs and/or JSON); reader works offline for previously opened content.

### Content Format Strategy

- **EPUB** is the format consumed by epub.js. Options for current Phase 1 JSON data:
  - **Option A:** Convert JSON → EPUB at build or ingest time; reader only loads EPUBs.
  - **Option B:** Keep JSON for existing catalog; add EPUB support and use epub.js for EPUB items; retain or phase out custom JSON reader later.
- MVP scope includes defining how existing sutras are exposed to epub.js (EPUB URLs or generated EPUB from JSON) and ensuring catalog, search, and “open book” flows point to the correct resource.

### Growth / Post-MVP (unchanged from base PRD)

- Reader customization refinements, more typography options, user-created bookmarks/highlights.
- Phase 3: integration with FastAPI + RAG for conversational AI.
- Future: user accounts, community annotations.

---

## User Journeys

*Same as existing Reader UI PRD; summarized here for completeness.*

1. **Devoted practitioner:** Opens app (e.g. from home screen) → navigates to category/sutra → opens sutra → reads with page-turn (tap/swipe) → adjusts theme/font size → closes app; next open resumes at same position.
2. **Curious beginner:** Opens app → uses global search → selects sutra → reads with same paginated, chromeless experience.
3. **Content maintainer:** Updates content (e.g. new EPUBs or JSON); static host redeploys; users get updates via existing cache/update flow.

Journey requirements that must still be met with epub.js:

- **Paginated reader UI:** Page-flip interaction (tap left/right or swipe), not only vertical scroll, unless UX spec explicitly allows a “continuous” mode in addition.
- **State persistence:** Reading position and preferences (theme, font size) saved via StorageService; resume from last position.
- **Offline-first:** App shell and book data (EPUBs and/or catalog) cached; full reading experience offline for cached content.
- **Global search:** Client-side search over catalog (unchanged).

---

## Domain and Compliance

*Unchanged from base PRD.*

- **Textual fidelity:** Render content without altering meaning; support Vietnamese diacritics and Pali/Sanskrit where applicable.
- **Respectful UI:** Calm, distraction-free interface; no disruptive animations or ad-like patterns.
- **Offline reliability:** Service Worker and caching must be robust (e.g. retreat/temple use).
- **Data integrity:** Graceful fallback and clear messaging if a book fails to load or parse; cache staleness handled (e.g. update prompt or background refresh).

---

## Reader Implementation: epub.js

### Library Choice

- **Library:** [epub.js](https://github.com/futurepress/epub.js) (FuturePress).
- **Role:** Rendering EPUB documents, handling pagination/locations, and navigation (next/prev, CFI, etc.) in the browser.

### Relevant epub.js Capabilities

- **Rendering:** Single-section (default) or continuous; flow options: auto, paginated, scrolled-doc.
- **Loading:** `book.open()` supports URL, path, or ArrayBuffer (fits static hosting and offline cache).
- **Locations/pagination:** `book.locations.generate()` (e.g. character interval) for location-based navigation and page estimation; use for progress and “current page / total” if needed.
- **Configuration:** Custom request method, headers, and asset handling (can align with Service Worker and auth if needed later).

### Integration Requirements

- **Flow:** Prefer **paginated** flow to match existing “page flip” UX; continuous may be offered as an option if UX spec is updated.
- **Navigation:** Map epub.js next/prev (and locations) to:
  - Tap zones (left/right 20%) and swipe.
  - Keyboard: Arrow keys, Page Up/Down.
- **Chromeless layout:** Existing ChromelessLayout (center-tap to show/hide chrome) wraps the epub.js iframe/viewer; no change to that pattern.
- **Theming:** Apply Monkai theme classes/CSS variables to the viewer container so Sepia/Light/Dark and font size apply to the rendered content.
- **Progress:** Persist current location (e.g. CFI or location key) via StorageService; on reopen, open book and display saved location.
- **Errors:** Use epub.js error/load events to drive existing ReaderErrorPage and loading states (skeleton or similar).

### Data Format

- **Reader input:** EPUB (file or URL). How existing JSON sutras are served as EPUB (conversion pipeline or dual format) is an implementation detail to be specified in architecture/tech spec.
- **Catalog:** Existing catalog index (e.g. `index.json`) can reference EPUB URLs or book IDs that resolve to EPUB; library and search continue to use current catalog structure.

---

## Functional Requirements

*Same as base Reader UI PRD; reader-related items interpreted in the context of epub.js.*

### Content Discovery & Navigation

- FR1: Users can browse the library by categories (e.g. Nikaya, Đại Thừa).
- FR2: Users can view a list of sutras within a category.
- FR3: Users can search for sutras by title or keywords across the catalog.
- FR4: Search results are shown from the cached catalog (offline-capable).

### Reading Experience

- FR5: Users can open a sutra and read its contents (via epub.js when content is EPUB).
- FR6: Users navigate forward and backward with discrete page turns (tap/swipe) consistent with paginated UX.
- FR7: Pagination/layout is driven by epub.js (viewport/locations); user font size and theme preferences apply to the reader.
- FR8: Load/parse errors are handled with clear, calm error states (e.g. ReaderErrorPage).

### Offline & Storage

- FR9: Catalog and previously opened books are available offline.
- FR10: App shell and catalog (and book assets) are cached on first visit.
- FR11: When online, catalog updates can be fetched in the background.
- FR12: Reading progress and settings use the abstracted storage layer.
- FR13: Users resume from the last saved position when reopening the app or a sutra.

### Reader Customization

- FR14: Users can change font size (applied to epub.js viewer context).
- FR15: Users can switch reading themes (Day, Night, Sepia).
- FR16: Customization is persisted across sessions.

---

## Non-Functional Requirements

*Same as base Reader UI PRD; reader-specific items adapted for epub.js.*

### Performance

- **TTI:** &lt; 2.0 seconds on a 3G-like connection after cache is populated.
- **Page turn:** Visual response to tap/swipe or keyboard &lt; 50ms where feasible (epub.js rendering performance).
- **Loading:** Book open and first render should not freeze the UI; locations generation or heavy work should be async or throttled if needed.

### Reliability

- **Offline:** Core reading (browse cached catalog, open cached book, change settings, save progress) works without network.
- **Storage:** Graceful handling of quota and storage errors (user-facing message, no silent crash).

### Accessibility

- **WCAG:** Themes meet WCAG AA contrast (e.g. 4.5:1 for text).
- **Scaling:** Layout supports increased text size (e.g. up to 200%) without breaking.
- **Touch targets:** Interactive areas (tap zones, buttons) at least 44×44 CSS pixels.
- **ARIA/screen readers:** Reader and chrome expose appropriate landmarks and live regions for page/location changes.

---

## Project Scoping & Phased Development

### MVP Focus

- **Reader:** Replace custom pagination engine with epub.js; support EPUB (and define JSON→EPUB or dual-format strategy).
- **Rest of app:** No change to PWA, library, search, storage, or settings architecture from existing Reader UI.
- **Deliverable:** Same user experience (paginated, chromeless, offline, progress, themes) implemented on top of epub.js.

### Risks and Mitigations

- **epub.js performance:** If locations generation or first paint is slow, use async generation, worker, or reduced granularity; document limits in tech spec.
- **Format migration:** If moving from JSON-only to EPUB, conversion and catalog mapping must be specified and tested; fallback or dual support reduces risk.
- **Browser support:** Align supported browsers with epub.js and existing PWA matrix; document any limitations.

---

## Out of Scope for This PRD

- Changes to crawler or Phase 1 data schema beyond what is needed to serve EPUB (or generate EPUB from JSON).
- Phase 3 AI/chat features.
- Native/hybrid app details (architecture remains hybrid-ready; epub.js runs in WebView context if needed later).

---

## References

- [Reader UI PRD (base)](_bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md)
- [Reader UI Epics](_bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md)
- [Reader UI Architecture](_bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md)
- [Reader UI UX Design](_bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md)
- [epub.js — GitHub](https://github.com/futurepress/epub.js)
- [epub.js documentation](https://github.com/futurepress/epub.js/tree/master/documentation) (API, examples)
