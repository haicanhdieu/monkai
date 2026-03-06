---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories]
inputDocuments: ["_bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md", "_bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md", "_bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md", "docs/ke-hoach-thu-vien-kinh-phat.md"]
---

# monkai - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for monkai, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

- FR1: Users can browse the library catalog by predefined categories (e.g., Nikaya, Đại Thừa).
- FR2: Users can view a list of individual sutras within a selected category.
- FR3: Users can search for specific sutras by title or keywords across the entire catalog.
- FR4: The system can display search results instantly from the locally cached catalog index.
- FR5: Users can open a specific sutra and read its contents.
- FR6: Users can navigate forward and backward through the text using discrete page turns (tapping/swiping) rather than vertical scrolling.
- FR7: The system can dynamically paginate text content based on the user's current screen dimensions and selected font size.
- FR8: The system can gracefully handle and display error states if a specific text fails to load or parse.
- FR9: Users can access the library catalog and any previously requested sutras without an active internet connection.
- FR10: The system can cache the application shell and catalog index automatically upon initial visit.
- FR11: The system can seamlessly fetch updated catalog data in the background when the user is online.
- FR12: The system can persist reading progress and states using an abstracted, cross-platform storage layer.
- FR13: Users can resume reading from their exact last-saved position when reopening the app or a specific sutra.
- FR14: Users can increase or decrease the text font size.
- FR15: Users can toggle between different reading visual themes (e.g., Day, Night, Sepia).
- FR16: The system applies user customization preferences persistently across all reading sessions.

### NonFunctional Requirements

- NFR1 (Instant Loading): Time to Interactive (TTI) must be under 2.0 seconds on a 3G mobile connection after the initial Service Worker cache is populated.
- NFR2 (Render Efficiency): The client-side pagination engine must calculate and render a new chapter (up to 500 paragraphs) in under 100 milliseconds to prevent UI freezing.
- NFR3 (Page Turn Latency): Tapping or swiping to the next page must respond visually in under 50 milliseconds (60fps) to feel instantaneous.
- NFR4 (Offline Support): 100% of core reading features must function without an internet connection.
- NFR5 (Storage Resilience): The application must gracefully handle browser storage limits.
- NFR6 (WCAG Compliance): Visual design elements must meet WCAG AA standards for contrast ratios (minimum 4.5:1).
- NFR7 (Legibility): The UI must support dynamic text scaling up to 200% without breaking the layout.
- NFR8 (Touch Targets): All interactive elements must have a minimum touch target size of 44x44 CSS pixels.

### Additional Requirements

- **Starter Template:** Official Vite + React Setup (with manual Tailwind v4 & PWA integration). *Note: impacts Epic 1 Story 1*.
- **Data Architecture:** Dexie.js for IndexedDB abstraction using Storage Abstraction Pattern (`StorageEngine.ts`).
- **State & Routing:** Zustand (v5.x) and React Router (v7.x).
- **Hosting Architecture:** GitHub Pages (Static Hosting).
- **Core Guidelines:** All functional components using React Hooks, OFFLINE first assumption, strict naming conventions (Dexie stores plural camelCase, JSON field naming strictly snake_case).
- **The Chromeless Reader:** UI disappears entirely during active reading.
- **Pagination Interaction:** Tap left/right or swipe to move to the next page.
- **Visuals:** Thematic Reading Environments (Vàng đất, nâu trầm, kem), Serifs for sutras (Lora/Merriweather), Sans-Serif for UI (Inter).
- **Interaction Patterns:** Ephemeral highlights for search results; unified discovery in a "Thư Viện" tab.

### FR Coverage Map

FR1: Epic 1 - Browse catalog by predefined categories
FR2: Epic 1 - View list of individual sutras within a selected category
FR3: Epic 3 - Search for specific sutras by title or keywords
FR4: Epic 3 - Display search results instantly from cached catalog index
FR5: Epic 2 - Open a specific sutra and read its contents
FR6: Epic 2 - Navigate forward/backward via discrete page turns
FR7: Epic 2 - Dynamically paginate based on screen dimensions and font size
FR8: Epic 2 - Handle and display error states for parsing/loading text
FR9: Epic 1 - Access catalog and previously requested sutras offline
FR10: Epic 1 - Cache application shell and catalog index
FR11: Epic 3 - Seamlessly fetch updated catalog data in the background
FR12: Epic 4 - Persist reading progress and states using storage layer
FR13: Epic 4 - Resume reading from exact last-saved position
FR14: Epic 4 - Increase or decrease text font size
FR15: Epic 4 - Toggle between reading visual themes (e.g., Day, Night, Sepia)
FR16: Epic 4 - Apply user customization preferences persistently across sessions

## Epic List

### Epic 1: Essential Library & Offline Foundation
Users can load the app instantly, use it reliably offline, and browse the available catalog by category.
**FRs covered:** FR1, FR2, FR9, FR10

### Story 1.1: Initialize PWA Shell and Storage Abstraction

As a Developer,
I want to scaffold the Vite+React application with Tailwind v4, PWA support, and Dexie.js,
So that the foundation for a performant, offline-first application is established.

**Acceptance Criteria:**

**Given** the project repository
**When** the developer runs the app locally or builds for production
**Then** the application serves a basic React shell styled with Tailwind
**And** the `StorageEngine.ts` wrapper around Dexie.js is configured and ready for use
**And** the service worker (`vite-plugin-pwa`) registers successfully.

### Story 1.2: Cache Catalog and App Shell for Offline Use

As a Devoted Practitioner,
I want the application to automatically save its essential files and catalog data when I first visit,
So that I can open the app and browse books even when I have no internet connection.

**Acceptance Criteria:**

**Given** a user visits the running web application for the first time
**When** the page finishes initial load
**Then** the service worker caches the HTML, CSS, JS assets
**And** the service worker pre-fetches the static `index.json` catalog from the server
**And** disconnecting from the network allows the app to be fully reloaded without errors.

### Story 1.3: Browse Sutra Categories (Trang Chủ / Thư Viện)

As a Curious Beginner,
I want to see a list of available Buddhist text categories (like Nikaya, Đại Thừa),
So that I can choose which section of the library to explore.

**Acceptance Criteria:**

**Given** the user is on the main Library view ("Thư Viện" tab)
**When** the view loads
**Then** it reads the cached `index.json`
**And** renders a grid or list of all available sutra categories
**And** tapping a category prepares to show its contents.

### Story 1.4: View Sutras Within Category

As a Curious Beginner,
I want to see all the individual sutras belonging to a specific category,
So that I can select a specific text to read.

**Acceptance Criteria:**

**Given** the user is viewing the Library categories
**When** the user taps a specific category
**Then** the view transitions to display a list of all sutras within that category
**And** each list item displays the sutra title clearly.

### Epic 2: The Immersive Reader Engine
Users can open a sutra from the library and read it seamlessly using discrete, tactile pagination that feels like a physical book.
**FRs covered:** FR5, FR6, FR7, FR8

### Story 2.1: Open and Render Simple Sutra Text

As a Devoted Practitioner,
I want to tap a sutra from the library and see its text rendered on the screen with the designated Serif typography,
So that I can begin reading the core content clearly.

**Acceptance Criteria:**

**Given** the user is browsing sutras in the Library
**When** they tap a specific sutra title
**Then** the app fetches the correct `.json` file for that sutra
**And** the `<ReaderEngine>` component renders the title and paragraphs using the designated typography (e.g., Lora/Merriweather)
**And** the layout respects the max-width reading column constraints.

### Story 2.2: Implement Client-Side Pagination Engine

As a Devoted Practitioner,
I want the reading interface to dynamically split the sutra text into distinct, screen-sized "pages" based on my device size,
So that I can read comfortably without losing my place via long vertical scrolling.

**Acceptance Criteria:**

**Given** a loaded sutra in the `<ReaderEngine>`
**When** the component renders on a specific device (Mobile, Tablet, Desktop)
**Then** it calculates how many paragraphs fit within the current viewport height (minus margins)
**And** it organizes the text array into distinct "pages"
**And** it ensures paragraphs are never cut off mid-line vertically.

### Story 2.3: Navigate via Discrete Page Turns

As a Devoted Practitioner,
I want to tap or swipe the edges of my screen to turn the page forward or backward,
So that navigating the text feels tactile and mimics a physical book.

**Acceptance Criteria:**

**Given** the user is viewing a paginated sutra
**When** they tap the right 20% of the screen (or swipe left)
**Then** the `<ReaderEngine>` transitions instantly (<50ms) to the next calculated page
**And** tapping the left edge (or swiping right) returns to the previous page
**And** a minimal progress indicator (e.g., "Page 3/45") updates accordingly.

### Story 2.4: The Chromeless UX Interaction

As a Devoted Practitioner,
I want the reading interface to be completely free of distractions, hiding menus and bars when I am reading,
So that I can focus entirely on the sacred text.

**Acceptance Criteria:**

**Given** the user is actively reading a sutra
**When** they tap the center 60% of the screen
**Then** the global `<ChromelessLayout>` toggles the visibility of the top/bottom navigation chrome
**And** the navigation bars fade in/out smoothly without causing the sutra text to jitter or reflow.

### Story 2.5: Graceful Error Recovery for Missing Texts

As a Curious Beginner,
I want the app to handle errors calmly if a specific text fails to load or parse,
So that I am gently guided back to the library instead of seeing confusing technical errors.

**Acceptance Criteria:**

**Given** the user attempts to load a sutra that is missing from the server or corrupted
**When** the `<ReaderEngine>` fails to parse the JSON
**Then** it catches the error gracefully
**And** displays a calm, thematically appropriate fallback screen ("Content unavailable")
**And** provides a single prominent button to return to the Library.

### Epic 3: Deep Search & Discovery
Users can instantly search across the entire offline catalog index by title/keyword and receive silent catalog updates in the background.
**FRs covered:** FR3, FR4, FR11

### Story 3.1: Build Unified Library Search Hub

As a Curious Beginner,
I want to use a prominent search bar within the "Thư Viện" tab to find sutras quickly,
So that I don't have to manually browse through nested categories.

**Acceptance Criteria:**

**Given** the user is on the "Thư Viện" tab
**When** they view the screen
**Then** there is a sticky search input at the top
**And** when the input is empty, the normal `<CategoryList>` is displayed
**And** the UI supports displaying a debounced `<SearchResults>` view when text is entered.

### Story 3.2: Implement Instant Client-Side Fuzzy Search

As a Curious Beginner,
I want the search results to appear instantly as I type, filtering through the entire catalog,
So that I can quickly verify if the text I want is available.

**Acceptance Criteria:**

**Given** the user is typing in the search bar
**When** they enter a query (e.g., "Bát Nhã")
**Then** the app performs a debounced fuzzy search against the cached `index.json`
**And** instantly (<50ms) replaces the category grid with the search results list
**And** the results list provides direct links to the matching sutras.

### Story 3.3: Background Catalog Updates

As a Regular User,
I want the catalog to secretly update itself when I am online,
So that I always have access to newly added texts without manually updating the app.

**Acceptance Criteria:**

**Given** the user opens the PWA while connected to the internet
**When** there is a new version of `index.json` on the server
**Then** the Service Worker fetches the new version seamlessly in the background
**And** the local search index is updated without disrupting the user's current reading session.

### Story 3.4: Ephemeral Search Highlights

As a Curious Beginner,
I want the sutra text to briefly highlight the section I searched for when I open it,
So that my eyes are immediately drawn to the relevant passage without permanent visual clutter.

**Acceptance Criteria:**

**Given** a user clicks a specific search result
**When** the `<ReaderEngine>` loads that specific page
**Then** the target paragraph has a soft background highlight
**And** the highlight fades out smoothly over 1.5 seconds.

### Epic 4: Personalization & Continuity
Users can adjust font sizes and visual themes, and the app will automatically save their reading progress to seamlessly resume later.
**FRs covered:** FR12, FR13, FR14, FR15, FR16

### Story 4.1: Persist Global User Settings (Themes and Fonts)

As a Devoted Practitioner,
I want my preferred font size and visual theme (Day/Night/Sepia) to be saved automatically,
So that I don't have to adjust them every single time I open the app.

**Acceptance Criteria:**

**Given** the user is on the "Cài Đặt" (Settings) tab
**When** they adjust the font size slider or toggle the theme
**Then** the Zustand store updates immediately to reflect the change globally
**And** the preference is saved to the persistent `StorageEngine`
**And** restarting the app loads these preferences automatically.

### Story 4.2: Implement Silent Auto-Save for Reading Progress

As a Devoted Practitioner,
I want the app to automatically remember exactly which page I am on while I read,
So that I never lose my place if I get interrupted or close the browser.

**Acceptance Criteria:**

**Given** the user is reading a sutra in the `<ReaderEngine>`
**When** they turn a page (forward or backward)
**Then** the app quietly updates the `lastReadPosition` (sutra ID and paragraph index) in the `StorageEngine`
**And** this operation does not slow down the page turn animation.

### Story 4.3: Smart Resume ("Continue Reading" Hero Card)

As a Daily Practitioner,
I want the home screen to prominently feature the exact text I was reading last,
So that I can resume reading with a single tap.

**Acceptance Criteria:**

**Given** the user has a globally saved `lastReadPosition`
**When** they launch the PWA and land on the "Trang Chủ" (Home) tab
**Then** the most prominent UI element is a "Continue Reading" Hero Card displaying the last read sutra title
**And** tapping the card loads the `<ReaderEngine>` directly to that exact saved page.

### Story 4.4: Storage Resiliency and Quota Handling

As a Devoted Practitioner,
I want to be warned gracefully if my device runs out of storage space for offline texts,
So that the app doesn't crash unpredictably.

**Acceptance Criteria:**

**Given** the browser storage quota is reached
**When** the `StorageEngine` attempts to cache a new JSON file and throws a `QuotaExceededError`
**Then** the app catches the error
**And** displays a specific, calm UI toast notifying the user they need to clear device space
**And** the app continues to function for already cached texts.
