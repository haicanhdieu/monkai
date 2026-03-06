---
stepsCompleted: [1, 2, 3]
inputDocuments: [
  "_bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md",
  "_bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md",
  "docs/ke-hoach-thu-vien-kinh-phat.md"
]
workflowType: 'architecture'
project_name: 'monkai'
user_name: 'Minh'
date: '2026-03-06'
lastStep: 1
status: 'in-progress'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The system provides an offline-capable PWA reading interface for Buddhist sutras. 16 FRs span four domains: catalog discovery (browse by category, global search), the reading experience (paginated page-flip engine, error states), offline/storage management (Service Worker caching, background sync, cross-platform storage persistence, resume from last position), and reader customization (font size, Day/Night/Sepia themes). The defining interaction—discrete paginated text from dynamically calculated viewport chunks—is novel and drives the majority of architectural decisions.

**Non-Functional Requirements:**
- TTI < 2.0s (post-SW cache) on 3G
- Pagination calculation < 100ms for up to 500 paragraphs
- Page turn visual response < 50ms (60fps)
- 100% core features offline
- WCAG AA contrast (min 4.5:1) across all three themes
- Dynamic text scaling up to 200% without layout breakage
- Touch targets minimum 44x44px

**Scale & Complexity:**

- Primary domain: PWA / Static Frontend (React 18 + Vite)
- Complexity level: Medium-High (pagination engine novelty + hybrid-ready abstraction)
- Estimated architectural components: ~8 core modules
- No real-time features, no multi-tenancy, no regulatory compliance, no backend API (MVP)

### Technical Constraints & Dependencies

- **Static hosting only (GitHub Pages):** No server-side logic, no dynamic API. All data is pre-crawled JSON from Phase 1.
- **Brownfield data schema:** Must consume existing Phase 1 `book-data/` JSON structure (id, title, category, subcategory, content as paragraph arrays).
- **Hybrid-ready from day 1:** Storage interfaces, routing, and fetch logic must be abstracted away from browser-native APIs to enable future Capacitor/React Native migration (Phase 4).
- **Phase 3 readiness:** Architecture must support adding a FastAPI + Claude RAG backend (Phase 3) without restructuring the frontend routing or state management.
- **Vietnamese/Pali/Sanskrit typography:** Font choice and fallback stacks are architectural constraints; they affect text measurement in the pagination engine.
- **No CSS-in-JS runtime:** Tailwind utility-first only. No styled-components or emotion (performance budget constraint).

### Cross-Cutting Concerns Identified

1. **Storage abstraction layer** — localStorage/IndexedDB on web, native storage on hybrid. Every stateful feature (bookmarks, settings, progress) routes through this.
2. **Service Worker lifecycle** — Cache-first strategy, background catalog sync, update prompts. Affects every network interaction.
3. **Performance budget** — 60fps page turns + <100ms pagination calc forces pre-calculation strategies and off-thread computation.
4. **Theme system** — 3 reading modes (Sepia/Light/Dark) affect typography rendering, color tokens, and contrast validation globally.
5. **Typography rendering** — Vietnamese diacritics + Pali characters must be validated for every font loaded; affects font loading strategy and pagination measurement.
6. **Phase 3 seam** — Reader components and routing must be designed to accept future dynamic data sources (search API, chat context links) without rewiring.

## Starter Template Evaluation

### Primary Technology Domain

PWA / Static Frontend based on project requirements analysis.
Stack confirmed by PRD: React + TypeScript, Vite, Tailwind CSS, Radix UI, Zustand/Context, React Router v6+, vite-plugin-pwa (Service Worker).

### Starter Options Considered

1. `create-vite` (react-ts) — Official Vite scaffolder. Minimal, no PWA or Tailwind. Would require manual setup of all critical infrastructure.
2. `@vite-pwa/create-pwa` (react-ts) — Official PWA scaffolder from the vite-pwa team. Configures vite-plugin-pwa, Workbox, and Web App Manifest out of the box.
3. Community templates (Vitamin, etc.) — Third-party, variable maintenance quality.

### Selected Starter: @vite-pwa/create-pwa (react-ts)

**Rationale for Selection:**
Service Worker and PWA caching are load-bearing infrastructure for this project — not an optional enhancement. The `@vite-pwa/create-pwa` tool correctly configures Workbox and the manifest, which is the most error-prone setup step. All other dependencies (Tailwind, Radix UI, Zustand, React Router) are standard additions.

**Initialization Command:**

```bash
npm create @vite-pwa/pwa@latest
# Select: react-ts template during interactive wizard
# Then add: tailwindcss, react-router-dom, @radix-ui/*, zustand, localforage
```

**⚠️ Version note:** v1.0.0 targets Vite 7 and may scaffold React 19. Verify React version at init and pin to 18 if needed for team compatibility.

**Architectural Decisions Provided by Starter:**

**Language & Runtime:** TypeScript (strict mode) with React JSX transform.

**Build Tooling:** Vite 7 — HMR in dev, optimized production bundle with tree-shaking.

**PWA Infrastructure:** vite-plugin-pwa pre-configured with:
- Workbox (generateSW or injectManifest strategy)
- Web App Manifest (icons, display: standalone, theme colors)
- Service Worker registration with update flow
- Dev-mode SW support

**Testing Framework:** Not included by default — Vitest + Testing Library added in story 1.

**Code Organization:** Standard Vite project structure (src/, public/, index.html at root). Directory conventions imposed by architecture decisions (see next section).

**Development Experience:** Fast HMR, TypeScript type-checking, Vite dev server. ESLint config included; Prettier added manually.

**Note:** Project initialization using this command should be the first implementation story.
