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
inputDocuments:
  - docs/ke-hoach-thu-vien-kinh-phat.md
workflowType: 'prd'
classification:
  projectType: Progressive Web App / Static Frontend
  domain: Religion & Spirituality / Education Technology
  complexity: Medium
  projectContext: brownfield
---

# Product Requirements Document - monkai

**Author:** Minh
**Date:** 2026-03-05T20:57:42+07:00


## Executive Summary

The Monkai project is a frontend-focused Progressive Web App (PWA) designed to provide users with a fast, beautifully formatted, and offline-capable interface for reading Buddhist texts (Phase 2). Building upon an existing rich data corpus crawled in Phase 1 (brownfield), it eliminates reliance on complex backends by fetching static JSON data hosted on a public GitHub repository. The goal is to maximize accessibility and the core reading experience across all devices before introducing advanced AI chat functionalities in later phases.

### What Makes This Special

Unlike traditional web libraries, this PWA is specifically designed for deep, uninterrupted reading with complete offline capabilities. It transforms thousands of pre-processed, structured JSON files into a highly responsive, native-feeling application. The core differentiator lies in its decoupled architecture: entirely static hosting combined with robust client-side routing, caching (via service workers), and reading customizations (themes, offline bookmarks), ensuring zero operational cost and maximum stability.

## Project Classification

**Project Type:** Progressive Web App / Static Frontend
**Domain:** Religion & Spirituality / Education Technology
**Complexity:** Medium
**Project Context:** Brownfield (Building UI for existing data crawler phase)

## Success Criteria

### User Success
- **Instant Access:** PWA loads instantly; users begin reading without network latency.
- **Uninterrupted Reading:** 100% offline access to downloaded sutras; reading remains stable through network drops.
- **Focus and Comfort:** UI provides a distraction-free environment, highly legible across Mobile, Tablet, and Desktop.

### Business Success
- **Zero Operational Independence:** 100% reduction in backend hosting costs via static hosting (e.g., GitHub Pages).
- **Scalability:** Architecture supports infinite concurrent users without performance degradation or infrastructure cost scaling.

### Technical Success
- **Performance Validated:** Lighthouse PWA and Performance scores ≥ 90.
- **Efficient Data Handling:** Client parses and caches large JSON catalogs without UI thread freezing.
- **Cross-Platform Compatibility:** Installable as a native-feeling application on iOS (Safari) and Android (Chrome).

### Measurable Outcomes
- Time to Interactive (TTI) < 2 seconds.
- 100% of core reading features function offline.

## Product Scope

### MVP - Minimum Viable Product

- **Core PWA Infrastructure:** Setup Vite + React with Service Worker for offline caching of static assets and JSON files.
- **Library Navigation:** Interface to browse categories (Nikaya, Đại Thừa, v.v.) and list individual sutras.
- **Sutra Reader UI:** Core reading interface with clean typography reflecting the established color palette (Vàng đất, nâu trầm, kem).
- **Basic Offline Search:** Simple client-side title/author search within the loaded catalog.

### Growth Features (Post-MVP)

- **Reader Customization:** Settings for font size, serif/sans-serif toggles, and day/night mode.
- **Progress Tracking:** Local bookmarks and reading history saved via `localStorage` or `IndexedDB`.
- **Advanced Navigation:** Cross-referencing links between related sutras.

### Vision (Future)

- **Phase 3 Integration:** Seamless integration of the FastAPI + RAG backend to provide the conversational AI Chat feature.
- **Community Features:** User accounts and community annotations/notes.

## User Journeys

### 1. The Devoted Practitioner: "Cô Bình" (Primary - Happy Path)
**Situation:** Cô Bình (65) reads *Kinh Pháp Hoa* daily. She currently struggles with heavy printed books or slow websites that lose her place when Wi-Fi drops.
**Goal:** A stable, highly readable digital text mimicking a paper book, with automatic progress saving.
**The Journey:**
* **Opening:** Cô Bình opens the Monkai app from her iPad home screen. It loads instantly (offline).
* **Action:** Navigates to *Đại Thừa* and selects *Kinh Pháp Hoa*.
* **Climax:** Taps left/right to flip pages like a physical book (no scrolling). Adjusts background to soft cream (kem) and increases font size. Reads offline.
* **Resolution:** Closes app. Current page saves automatically. Next session opens exactly where she stopped.

### 2. The Curious Beginner: "Minh" (Primary - Discovery/Search)
**Situation:** Minh (20, student) wants to read "Bát Nhã Ba La Mật Đa" but lacks knowledge of Buddhist taxonomy.
**Goal:** Quickly find a specific sutra by title without category navigation.
**The Journey:**
* **Opening:** Minh opens the Monkai web link.
* **Action:** Uses the global search bar on the home screen; types "Bát Nhã".
* **Climax:** Offline search instantly filters the pre-loaded static index, displaying "Bát Nhã Ba La Mật Đa Tâm Kinh".
* **Resolution:** Taps result, reads text. Installs PWA to Home Screen for future exploration.

### 3. The Content Maintainer: "Pháp Hòa" (Admin/Ops Workflow)
**Situation:** Pháp Hòa (Volunteer Developer) generated new JSON files via the Phase 1 crawler.
**Goal:** Deploy new sutras seamlessly with zero downtime.
**The Journey:**
* **Opening:** Pháp Hòa commits/pushes JSON files to the `book-data` folder in the public GitHub repo.
* **Action:** GitHub Pages redeploys the static site silently.
* **Climax:** Online users' Service Workers detect the updated index and background-fetch the new catalog without interrupting active reading sessions.
* **Resolution:** New texts become searchable and readable for all users automatically.

### Journey Requirements Summary

- **Offline-First PWA (Service Worker):** Must cache the app shell and JSON data so it loads instantly without network.
- **Paginated Reader UI:** Critical requirement to implement a "page flip" mechanism (tap left/right or swipe) rather than a continuous vertical scroll, simulating a paper book.
- **State Persistence:** Must save reading preferences (font size, theme) and reading progress (current page/sutra) to `localStorage` or `IndexedDB`.
- **Offline-First PWA (Service Worker):** Must cache the app shell and JSON data so it loads instantly without network.
- **Paginated Reader UI:** Critical requirement to implement a "page flip" mechanism (tap left/right or swipe) rather than a continuous vertical scroll, simulating a paper book.
- **State Persistence:** Must save reading preferences (font size, theme) and reading progress (current page/sutra) to `localStorage` or `IndexedDB`.
- **Global Search:** Fast, client-side search across the static JSON catalog index.
- **Static Hosting Architecture:** App must be entirely decoupled from a backend API, fetching static JSON files directly from the hosting provider.

## Domain-Specific Requirements

### Compliance & Standards
- **Textual Fidelity:** The UI must render the crawled JSON texts exactly as provided, preserving paragraphs and formatting without any client-side alteration that could change the meaning of the sutras.
- **Language & Typographic Support:** Full support for Vietnamese diacritics and Pali/Sanskrit special characters is mandatory across all supported devices and fonts.

### Technical Constraints
- **Offline Reliability:** Since users may read in environments without internet (e.g., during retreats or at temples), the Service Worker caching must be robust and aggressively tested.
- **Respectful UI/UX:** The interface must remain distraction-free. No generic pop-ups, disruptive animations, or ad-like UI patterns. The reading space should feel calm and focused.
- **Data Ingestion Extensibility:** While the MVP will exclusively load data from structured JSON files, the core reader components and state-management system must be designed abstractly. This ensures future phases can seamlessly support ingestion and rendering of other formats like EPUB, MOBI, and PDF without rewriting the reader UI.

### Risk Mitigations
- **Data Integrity Risk:** Corrupted files from the static host could lead to unreadable pages.
  *Mitigation:* The PWA must have graceful fallback error states and clearly inform the user if a specific text fails to parse.
- **Cache Stale Risk:** Users might act on outdated caches if the maintainers update typos in the texts on GitHub.
  *Mitigation:* The Service Worker should implement an "Update Available" UI prompt or a seamless background-sync when new data is detected.

## Web App (PWA) Specific Requirements

### Project-Type Overview
Monkai Phase 2 is a Single Page Application (SPA) built as a Progressive Web App (PWA) to provide a native-like, offline-capable reading experience across all devices. The architecture must explicitly support future conversion to a Hybrid Mobile App (e.g., via Capacitor or React Native Web).

### Technical Architecture Considerations
- **SPA Framework:** React 18 built with Vite for fast HMR and optimized production bundles.
- **Hybrid-Ready Abstraction:** Core logic (fetching JSON, pagination math, bookmark state) must be entirely decoupled from browser-specific APIs (like `window` or Service Workers). Storage mechanisms must use abstracted interfaces that can seamlessly switch between `IndexedDB` (for Web) and native SQLite/AsyncStorage (for Hybrid).
- **State Management:** Local client state (Zustand or React Context) augmented with abstract storage layers for persisting user settings (theme, font size) and reading progress (bookmarks).
- **Service Worker Strategy (Web Only):** "Cache-First" for core app shell and downloaded sutra JSON files to guarantee instant offline loading on the web platform.
- **Routing:** Client-side routing (React Router) to handle navigation between the library index, sutra categories, and the active reader view.

### Implementation Considerations
- **Responsive Matrix:** Must support Mobile (320px+), Tablet (768px+), and Desktop (1024px+). The reader UI explicitly requires touch-friendly pagination zones (tap left/right) on mobile devices.
### Implementation Considerations
- **Responsive Matrix:** Must support Mobile (320px+), Tablet (768px+), and Desktop (1024px+). The reader UI explicitly requires touch-friendly pagination zones (tap left/right) on mobile devices.
- **Accessibility (a11y):** Must adhere to WCAG standards for contrast ratios. The reader UI must support dynamic font scaling without breaking the layout.
- **SEO Strategy:** As a client-side PWA relying on JSON data, deep SEO indexing of individual sutras is not the primary goal for the MVP; the focus is on the app installation and reading experience.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy
**MVP Approach:** Experience MVP. The goal is to prove that a static, offline-first PWA can deliver a superior, distraction-free reading experience for complex Buddhist texts compared to existing dynamic websites. 
**Resource Requirements:** 1-2 Frontend Developers (React/PWA focus), 1 UI/UX Designer.

### MVP Feature Set
**Core User Journeys Supported:**
- The Devoted Practitioner (Daily offline reading, state persistence, paginated UI).
- The Curious Beginner (Quick search and discovery).

**Must-Have Capabilities:**
- **Paginated Reader Engine:** The core component that parses JSON paragraphs and renders them into swipeable/tappable distinct pages based on screen size, instead of a vertical scrolling view.
- **Cross-Platform Storage Layer:** Research and implement a storage abstraction library (e.g., `localforage` or Capacitor Storage) that supports both browser-based `IndexedDB` and native mobile device storage for future hybrid implementation.
- **Offline Storage Sync:** Service Worker caching for the app shell and pre-fetching of the static JSON catalog.
- **Basic Library UI:** An interface to browse `vbeta` categories and select a book.
- **Reader Settings:** Ability to change font size and toggle Day/Night/Sepia themes.
- **Local Bookmarks:** Automatically saving the last-read user position to the abstracted storage layer.

### Post-MVP Features (Growth)
- Support for rendering external EPUB/PDF formats in the browser.
- Advanced typography settings (font family selection, line-height adjustments).
- User-created bookmarks and local highlights (saved via IndexedDB/Hybrid storage).
- Cross-referencing footnotes within the texts.

### Risk Mitigation Strategy
**Technical Risks:** Calculating pagination dynamically on the client-side without stuttering the UI. 
*Mitigation:* Build a lean proof-of-concept for the pagination engine first before building the rest of the PWA shell.
**Market Risks:** Users might not understand how to "Install" a PWA. 
*Mitigation:* Include a clear, unobtrusive one-time onboarding tooltip explaining how to add the app to the home screen.
**Resource Risks:** The pagination engine proves too complex for the frontend MVP timeline.
*Mitigation:* Fallback to a highly optimized, virtualized vertical scrolling list for the MVP, and introduce pagination in a minor update.

## Functional Requirements

### Content Discovery & Navigation
- FR1: Users can browse the library catalog by predefined categories (e.g., Nikaya, Đại Thừa).
- FR2: Users can view a list of individual sutras within a selected category.
- FR3: Users can search for specific sutras by title or keywords across the entire catalog.
- FR4: The system can display search results instantly from the locally cached catalog index.

### Reading Experience
- FR5: Users can open a specific sutra and read its contents.
- FR6: Users can navigate forward and backward through the text using discrete page turns (tapping/swiping) rather than vertical scrolling.
- FR7: The system can dynamically paginate text content based on the user's current screen dimensions and selected font size.
- FR8: The system can gracefully handle and display error states if a specific text fails to load or parse.

### Offline & Storage Management
- FR9: Users can access the library catalog and any previously requested sutras without an active internet connection.
- FR10: The system can cache the application shell and catalog index automatically upon initial visit.
- FR11: The system can seamlessly fetch updated catalog data in the background when the user is online.
- FR12: The system can persist reading progress and states using an abstracted, cross-platform storage layer.
- FR13: Users can resume reading from their exact last-saved position when reopening the app or a specific sutra.

### Reader Customization
- FR14: Users can increase or decrease the text font size.
- FR15: Users can toggle between different reading visual themes (e.g., Day, Night, Sepia).
- FR16: The system applies user customization preferences persistently across all reading sessions.

## Non-Functional Requirements

### Performance
- **Instant Loading:** Time to Interactive (TTI) must be under 2.0 seconds on a 3G mobile connection after the initial Service Worker cache is populated.
- **Render Efficiency:** The client-side pagination engine must calculate and render a new chapter (up to 500 paragraphs) in under 100 milliseconds to prevent UI freezing.
- **Page Turn Latency:** Tapping or swiping to the next page must respond visually in under 50 milliseconds (60fps) to feel instantaneous.

### Reliability (Offline Capabilities)
- **Offline Support:** 100% of core reading features (browsing catalog, reading downloaded texts, changing settings, saving bookmarks) must function without an internet connection.
- **Storage Resilience:** The application must gracefully handle browser storage limits (e.g., `QuotaExceededError`) by alerting the user, rather than crashing silently.

### Accessibility
- **WCAG Compliance:** Visual design elements (especially in Day, Night, and Sepia themes) must meet WCAG AA standards for contrast ratios (minimum 4.5:1 for normal text).
- **Legibility:** The UI must support dynamic text scaling up to 200% without breaking the layout or overlapping elements.
- **Touch Targets:** All interactive elements (page turn zones, buttons, links) must have a minimum touch target size of 44x44 CSS pixels.
