---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - docs/multi-source-library-spec.md
  - docs/ke-hoach-thu-vien-kinh-phat.md
  - _bmad-output/project-context.md
workflowType: 'prd'
projectName: 'monkai'
phase: 'Phase A — Multi-Source Library UI + Reading'
classification:
  projectType: pwa_consumer
  domain: cultural_education
  complexity: medium
  projectContext: brownfield
---

# Product Requirements Document — Monkai Phase A: Multi-Source Library UI + Reading

**Author:** Minh  
**Date:** 2026-04-18  
**Phase:** A — Library UI, catalog browsing, and full book reading for both sources

---

## Executive Summary

Monkai is a Vietnamese-language Progressive Web App (PWA) for reading Buddhist scriptures and, starting with Phase A, general Vietnamese fiction and stories. The app currently serves one content source — **vbeta** (Kinh Phật, Buddhist scriptures) — via a category browser, full-text reader, and bookmark shelf. A second source — **vnthuquan** (Sách & Truyện, general fiction/stories) — has been crawled and indexed; its content is ready for integration.

Phase A introduces multi-source library browsing and reading: users can switch between the two libraries from the Library page, with all catalog UI (categories, search bar, subtitle, book count) adapting to the active source. Source preference persists across sessions. Book cards everywhere in the app gain a source badge for provenance clarity. vnthuquan books are fully readable in Phase A — the vnthuquan `book.json` format shares the same `chapters[].pages[].html_content` structure as vbeta, so the existing parsing pipeline (`book.schema.ts`, `normalizeParagraphs`, epub.js reader) works without a new content model.

### What Makes This Special

Monkai unifies two culturally distinct Vietnamese reading collections — sacred Buddhist texts and general fiction — under a single, coherent reading app without exposing the complexity of multiple backend data sources to the user. The source selector is intentionally minimal (two pill buttons, 32 px) and the source vocabulary is purely display-label driven (`Kinh Phật` / `Sách & Truyện`) — no internal IDs, no source management UI, no friction. The user experience is: pick your library, browse, read.

---

## Project Classification

- **Project Type:** Brownfield PWA extension (Consumer, mobile-first)
- **Domain:** Cultural/Spiritual + General Literature (Vietnamese)
- **Complexity:** Medium — dual data source architecture, offline PWA constraints, cross-source state isolation required
- **Context:** Brownfield — Phase 1 crawler and Phase 2 reader are both complete and in production

---

## Success Criteria

### User Success

- A user arriving on the Library page can switch to Sách & Truyện with a single tap and immediately see vnthuquan categories without reloading or navigating away.
- A user who set Sách & Truyện as their last library returns to the app and lands on Sách & Truyện automatically.
- A user can tell at a glance which library a bookmarked title belongs to (source badge on all cards).
- Search results are never mixed across sources — a user searching while on Kinh Phật only sees vbeta titles.
- A user can tap a vnthuquan book from search or category and read it in the existing reader without any degraded experience.

### Business / Project Success

- All vnthuquan content (categories, books, reading) is fully available from day one of Phase A release — no "empty shelf" or "coming soon" user experience.
- The vbeta index and all existing vbeta functionality are unchanged and unaffected.
- The implementation fits within the existing monorepo conventions (no new dependencies, no new build steps).

### Technical Success

- Switching source triggers a catalog load that completes in under 3 seconds on a typical mobile connection; subsequent switches to a previously loaded source are instant (served from TanStack Query cache).
- The `BookIndexEntry.source` field is present and accurate for all records in both indexes.
- Zero ESLint warnings; all existing and new tests pass.
- Zustand persist correctly stores and rehydrates the active source preference via localStorage.

### Measurable Outcomes

- vnthuquan categories and books are visible in the Library when vnthuquan source is active.
- vbeta categories and books remain exactly as before when vbeta source is active.
- Source badge renders on every book card in category listings and bookmark shelf.
- Crawler `build-index --source vnthuquan` command produces a valid `vnthuquan/index.json`.
- Tapping a vnthuquan book opens the epub.js reader and renders chapter content correctly.

---

## Product Scope

### Phase A — MVP (This PRD)

**Crawler:**
- Add `source: str` field to `BookIndexEntry` Pydantic model
- Extend `indexer.py:build_book_data_index` to accept `--source` option, scope scan directory and output path
- vbeta default behavior (no `--source` flag) unchanged

**Reader:**
- `sources.ts` constants file (SOURCES array, SourceId type, DEFAULT_SOURCE)
- `useActiveSource` Zustand store with `persist` middleware
- `SourceSelectorPill` component (two pill buttons, reads/writes `useActiveSource`)
- `useCatalogIndex(source)` hook — source-parameterized
- `DataService.getCatalog(source)` — source-based URL routing, per-source promise cache
- `queryKeys.catalog(source)` — source-keyed query cache
- `CatalogBook.source` field (type + Zod schema + mapping)
- `LibrarySearchBar` `placeholder` prop
- `LibraryPage` wired: source selector, source-scoped catalog, adaptive subtitle/placeholder/count
- `SutraListCard` source badge chip
- `DataService.getBook` updated to resolve books across per-source catalogs (source-aware catalog lookup)

**Deferred (post-Phase A):**
- Cross-source search
- Source-specific reading settings/preferences

### Growth Features (Post-Phase A)

- Cross-source search (unified search across both libraries)
- Additional sources (third library integration via config)

### Vision

- N-source support with zero code changes (config-only new source onboarding)
- Source-specific reading experience customization
- AI-assisted cross-library recommendations

---

## User Journeys

### Journey 1: Lan switches to Sách & Truyện for the first time

Lan is a regular Monkai user who reads Buddhist texts. She has heard from a friend that the app now has a "Sách & Truyện" section with Vietnamese novels. She opens the app, taps Library, and sees two pill buttons below the search bar: `Kinh Phật` (active, filled) and `Sách & Truyện`. She taps `Sách & Truyện`. The search bar placeholder changes to "Tìm kiếm sách & truyện...", the subtitle becomes "Khám phá kho sách truyện tổng hợp", and a new grid of categories appears — Kiếm Hiệp, Ngôn Tình, Khoa Huyễn, etc. She taps Kiếm Hiệp, finds a title she recognizes, and adds it to her bookmarks. The next day, she opens the app again and Sách & Truyện is still her active source.

**Capabilities revealed:** Source selector, source persistence, catalog source-scoping, category browse, bookmarking from either source.

### Journey 2: Minh reads across both libraries from his bookmark shelf

Minh actively uses both libraries. He has bookmarked titles from both Kinh Phật and Sách & Truyện over several weeks. He opens the bookmark shelf and sees a mixed list. Each card shows a small chip — indigo `[Kinh Phật]` or amber `[Sách & Truyện]` — making provenance immediately obvious. He taps a vbeta scripture and the reader opens normally. He then taps a vnthuquan novel; the reader opens the same way, chapter content renders correctly (the HTML is stripped to plain paragraphs via the existing `normalizeParagraphs` pipeline), and the epub.js reading experience is identical.

**Capabilities revealed:** Unified bookmark shelf, source badge on cards, vnthuquan book reading via existing reader pipeline, cross-source catalog lookup in `getBook`.

### Journey 3: Minh runs the indexer for vnthuquan

As the project owner, Minh runs `uv run python indexer.py build-index --source vnthuquan` from `apps/crawler/`. The indexer scans `data/book-data/vnthuquan/`, writes `data/book-data/vnthuquan/index.json`, and populates `source: "vnthuquan"` on every `BookIndexEntry`. He runs `uv run python indexer.py build-index` (no flag) and confirms vbeta index at `data/book-data/index.json` is unchanged.

**Capabilities revealed:** CLI `--source` option, per-source index file, backward-compat default.

### Journey Requirements Summary

| Capability | Journey |
|---|---|
| Source selector pill | 1 |
| Active source persistence (localStorage) | 1 |
| Source-scoped catalog fetch | 1 |
| Source-adaptive library UI (subtitle, placeholder, count suffix) | 1 |
| Category browse per source | 1 |
| Unified bookmark shelf | 2 |
| Source badge on book cards | 2 |
| vnthuquan book reading via existing reader pipeline | 2 |
| Cross-source catalog lookup in `getBook` | 2 |
| Per-source indexer CLI | 3 |
| `source` field on `BookIndexEntry` | 3 |
| Backward-compatible vbeta indexing | 3 |

---

## PWA Consumer Specific Requirements

### Technical Architecture Considerations

This is a brownfield extension of an existing Vite 7 + React 18 + Zustand + TanStack Query PWA. The multi-source integration must not introduce new dependencies or alter existing data contracts for vbeta.

**Source configuration as single source of truth:** All source labels, placeholders, subtitles, count suffixes, and badge colors live in `apps/reader/src/shared/constants/sources.ts` as a `SOURCES` constant array. No source metadata is hardcoded in component files.

**Catalog cache isolation:** TanStack Query cache is keyed by `['catalog', source]`. DataService maintains a `Map<SourceId, Promise<CatalogIndex>>` to prevent redundant in-flight fetches. Switching source does not invalidate the previously loaded source's cache.

**Storage:** Source preference stored via Zustand `persist` middleware with key `'active-source'`. This goes through Zustand's built-in storage, not directly to `localStorage` (consistent with the project's StorageService pattern for localforage-managed data; Zustand persist for UI preferences is acceptable).

**URL routing for catalog:**
- vbeta: `/book-data/index.json` (unchanged path)
- vnthuquan: `/book-data/vnthuquan/index.json`

**Data contract:** Both index files share the `BookIndex` schema. Reader Zod schemas in `catalog.schema.ts` must parse the new `source` field on `BookIndexEntry`.

**book.json compatibility:** vnthuquan `book.json` has the same top-level structure as vbeta — `chapters[].pages[].html_content`. The existing `book.schema.ts` (`rawBookSchema`, `normalizeParagraphs`, `decodeHtmlEntities`) already parses it correctly without modification. The EPUB-from-JSON pipeline (`bookToEpub.ts`) and epub.js reader therefore work unchanged for vnthuquan content.

**`getBook` source-aware lookup:** `DataService.getBook(id)` currently calls `this.getCatalog()` (single catalog). With multi-source, it must look up the book entry across the correct per-source catalog. Approach: `getBook(id: string, source: SourceId)` — callers (the `useBook` hook and read route) pass the source. The `source` is available from the `CatalogBook.source` field at the point the user initiates reading.

### Crawler Integration

- `BookIndexEntry` in `models.py` gains `source: str` (no default — always explicitly set by indexer)
- `build_book_data_index(output_dir, logger, source=None)`:
  - `scan_root = book_data_dir / source if source else book_data_dir`
  - `index_path = scan_root / "index.json"`
  - Each `BookIndexEntry.source` set to `source` param (or derived from first path component when `source=None` for vbeta)
- CLI: `build-index` command gains `--source` option (Typer, optional str)

### Component Architecture

- `SourceSelectorPill` — new, in `features/library/`, reads/writes `useActiveSource`. Accepts `onSourceChange?: () => void` callback to clear search query from parent.
- `LibrarySearchBar` — existing, gains `placeholder?: string` prop.
- `SutraListCard` — existing, gains source badge chip using `book.source` resolved through `SOURCES`.
- `LibraryPage` — existing, wired to compose the above: `useActiveSource()`, `useCatalogIndex(activeSource)`, `SOURCES.find(s => s.id === activeSource)`.

### Implementation Considerations

- All path aliases use `@/shared/...`, `@/features/...` — no relative imports across feature boundaries.
- `verbatimModuleSyntax` is enabled — use `import type` for type-only imports.
- Run `pnpm test` and `pnpm lint` (zero warnings) before considering any story done.
- No `localStorage`, `indexedDB`, or `localforage` direct usage; Zustand persist handles source preference.

---

## Functional Requirements

### Source Selection & Persistence

- **FR1:** User can select between two sources (Kinh Phật / Sách & Truyện) using a pill toggle on the Library page.
- **FR2:** The active source selection persists across Library tab navigation, bottom-nav navigation, and app restarts.
- **FR3:** Source is presented to users exclusively by display label — internal source IDs (`vbeta`, `vnthuquan`) are never rendered in the UI.
- **FR4:** Switching source clears the active search query and resets the library view to the category grid.
- **FR5:** The default source on first install is Kinh Phật (`vbeta`).

### Library Browsing

- **FR6:** User can view a category grid populated exclusively from the active source's catalog.
- **FR7:** The category count (e.g., "8 nhóm") reflects only the active source's categories.
- **FR8:** The library subtitle adapts to describe the active source's content (e.g., "Khám phá kinh điển Phật giáo" vs "Khám phá kho sách truyện tổng hợp").
- **FR9:** The count suffix on category cards adapts per source ("kinh sách" for vbeta, "cuốn sách" for vnthuquan).
- **FR10:** User can browse the book list within a category, scoped to the active source.

### Search

- **FR11:** The search bar placeholder text adapts to describe the active source's content type.
- **FR12:** Search results are scoped to the active source only.
- **FR13:** Cross-source search is not supported in Phase A (deferred).

### Book Discovery & Source Badges

- **FR14:** Every book card in the category book list displays a small source badge chip identifying its source.
- **FR15:** Every book card in the bookmark shelf displays a source badge chip identifying its source.
- **FR16:** The source badge displays the source's display label (not raw ID), resolved from the SOURCES config.
- **FR17:** vbeta source badge uses an indigo muted color; vnthuquan source badge uses an amber muted color.
- **FR18:** The bookmark shelf remains a unified view across both sources — source badge is provenance info only, not a filter control.

### Home Screen

- **FR19:** The Home screen is unchanged in Phase A — recent reads show their source badge naturally via the card component.
- **FR20:** Daily Dharma section is source-agnostic and always displays regardless of active source.

### vnthuquan Book Reading

- **FR21:** vnthuquan books appear in category listings and search results with their full metadata.
- **FR22:** User can tap a vnthuquan book and open it in the existing epub.js reader; chapter content renders correctly via the existing HTML-stripping pipeline.
- **FR34:** `DataService.getBook` accepts a `source` parameter and fetches the book entry from the correct per-source catalog.
- **FR35:** The `Book` type and schema include a `source` field so the reader can identify which source a book belongs to at read time.

### Crawler Data Pipeline

- **FR23:** The `BookIndexEntry` model includes a `source` field (`str`) on every record.
- **FR24:** The indexer CLI `build-index` command accepts an optional `--source` parameter to specify which source to index.
- **FR25:** When `--source vnthuquan` is passed, the indexer scans `data/book-data/vnthuquan/` and writes `data/book-data/vnthuquan/index.json`.
- **FR26:** When `--source` is omitted, the indexer behaves exactly as before (vbeta behavior, unchanged output path).
- **FR27:** The vnthuquan `index.json` conforms to the same `BookIndex` schema as the vbeta index.

### Reader Data Layer

- **FR28:** The `CatalogBook` interface includes a `source` field (`string`).
- **FR29:** The catalog Zod schema parses the `source` field from raw index data and maps it to `CatalogBook`.
- **FR30:** The `useCatalogIndex` hook accepts a `source` parameter and fetches the appropriate catalog.
- **FR31:** The catalog query key includes `source` to ensure per-source cache isolation in TanStack Query.
- **FR32:** The data service maintains a per-source promise cache to prevent redundant in-flight catalog fetches.
- **FR33:** The data service resolves the correct catalog URL based on source (`/book-data/index.json` for vbeta; `/book-data/{source}/index.json` for others).

---

## Non-Functional Requirements

### Performance

- Switching source to a previously loaded catalog is instantaneous — served from TanStack Query in-memory cache (staleTime: Infinity per existing architecture).
- First catalog load for any source completes within 3 seconds on a standard mobile connection (same bar as existing vbeta catalog).
- The `SourceSelectorPill` renders with no perceptible delay; no async operations block the pill toggle animation.

### Accessibility

- Source selector pill buttons communicate active state via `aria-pressed` (true/false).
- Active/inactive pill color combinations meet WCAG AA contrast requirements (4.5:1 minimum).
- Source badge chips do not rely on color alone — the label text provides the same information as the color.

### Reliability & Data Integrity

- Source preference persists reliably via Zustand persist middleware; rehydration occurs before first render to avoid flash of wrong source.
- If the vnthuquan catalog fetch fails (network error, file missing), the Library renders an error state without affecting vbeta functionality or crashing the app.
- The vbeta `index.json` at its existing path is never modified or relocated by Phase A changes.

### Integration & Backward Compatibility

- The reader's existing `useCatalogIndex` call sites that do not yet pass a source must be updated to pass `activeSource` — no silent fallbacks that hide missing source argument.
- Zod schema changes (adding `source` field) must be backward-compatible: if `source` is absent in older index data, parse should fail fast (field is required, not optional) since both indexes will be regenerated.
- Crawler test suite (`uv run pytest`) must pass without modification to existing tests.

### Code Quality

- Zero ESLint warnings (`eslint src --max-warnings 0`).
- Ruff check passes on all crawler changes.
- All new React components use TypeScript with strict mode; no `any` types.

---

## Open Questions & Phase B Notes

| Question | Decision |
|---|---|
| Cross-source search | Deferred to v2 |
| Can the user filter the bookmark shelf by source? | Not in Phase A — bookmarks remain unified |
| `getBook` signature change: `(id, source)` or internal source resolution? | Prefer explicit `(id: string, source: SourceId)` — caller has source context at read-time |
| Does `useBook` hook need to accept source, or should it read from `useActiveSource`? | Implementation detail for story; either works, prefer explicit prop threading |
| Naming for new PRD output path | This file is at `planning-artifacts/prd.md`; a phase-specific move (`phase-3-multi-source/prd-multi-source.md`) can be done at story creation time |

---

## Change Summary

### Crawler (`apps/crawler/`, Python)

| File | Change |
|---|---|
| `models.py` | Add `source: str` to `BookIndexEntry` |
| `indexer.py` | `build_book_data_index(source=None)` scopes scan + output path; sets `source` on each entry |
| `indexer.py` CLI | Add `--source` option to `build-index` Typer command |

### Reader (`apps/reader/src/`, TypeScript/React)

| File | Change | Type |
|---|---|---|
| `shared/constants/sources.ts` | SOURCES array, SourceId, DEFAULT_SOURCE | New |
| `shared/stores/useActiveSource.ts` | Zustand store with persist | New |
| `features/library/SourceSelectorPill.tsx` | Pill toggle component | New |
| `shared/types/global.types.ts` | Add `source` to `CatalogBook` | Edit |
| `shared/schemas/catalog.schema.ts` | Parse + map `source` field | Edit |
| `shared/services/data.service.ts` | `getCatalog(source)`, per-source URL + cache | Edit |
| `shared/constants/query.keys.ts` | `catalog(source)` key | Edit |
| `shared/hooks/useCatalogIndex.ts` | Accept `source` param | Edit |
| `features/library/LibraryPage.tsx` | Wire source selector, adaptive UI | Edit |
| `features/library/LibrarySearchBar.tsx` | `placeholder` prop | Edit |
| `features/library/SutraListCard.tsx` | Source badge chip | Edit |
| `shared/services/data.service.ts` | `getBook(id, source)` — per-source catalog lookup | Edit (same file, additional change) |
| `shared/types/global.types.ts` | Add `source` to `Book` type | Edit (same file, additional change) |
| `shared/schemas/book.schema.ts` | Parse + map `source` field on `Book` | Edit |

> **Note:** `book.schema.ts` content parsing (`normalizeParagraphs`, `decodeHtmlEntities`, `rawBookSchema`) requires no changes — vnthuquan and vbeta `book.json` share the same `chapters[].pages[].html_content` structure.
