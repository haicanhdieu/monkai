---
title: 'Phase A — Multi-Source Library UI + Reading'
slug: 'phase-a-multi-source'
created: '2026-04-18'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Python 3.11 / Pydantic v2 / Typer (crawler)'
  - 'React 18 / TypeScript / Vite 7 / Tailwind v3 (reader)'
  - 'Zustand + persist middleware (source store)'
  - 'TanStack Query v5 staleTime:Infinity (catalog caching)'
  - 'Zod (schema parsing)'
  - 'Vitest + Testing Library (tests)'
files_to_modify:
  - 'apps/crawler/models.py'
  - 'apps/crawler/indexer.py'
  - 'apps/reader/src/shared/constants/sources.ts'
  - 'apps/reader/src/shared/stores/useActiveSource.ts'
  - 'apps/reader/src/shared/types/global.types.ts'
  - 'apps/reader/src/shared/schemas/catalog.schema.ts'
  - 'apps/reader/src/shared/services/data.service.ts'
  - 'apps/reader/src/shared/constants/query.keys.ts'
  - 'apps/reader/src/shared/hooks/useCatalogIndex.ts'
  - 'apps/reader/src/shared/hooks/useBook.ts'
  - 'apps/reader/src/features/library/SourceSelectorPill.tsx'
  - 'apps/reader/src/features/library/LibraryPage.tsx'
  - 'apps/reader/src/features/library/LibrarySearchBar.tsx'
  - 'apps/reader/src/features/library/SutraListCard.tsx'
  - 'apps/reader/src/features/bookmarks/BookmarksPage.tsx'
  - 'apps/reader/src/features/reader/ReaderPage.tsx'
code_patterns:
  - 'Zustand stores at src/stores/ using create<State>()(immer(...))'
  - 'Zustand persist middleware for UI preferences (see settings.store.ts)'
  - 'queryKeys factory object at shared/constants/query.keys.ts'
  - 'DataService interface + StaticJsonDataService class'
  - 'Zod schema → transform → typed output (catalog.schema.ts, book.schema.ts)'
  - 'Path aliases: @/shared/..., @/features/... — no relative cross-boundary imports'
  - 'verbatimModuleSyntax: use import type for type-only imports'
  - 'CSS custom properties for theming: var(--color-surface), var(--color-accent), etc.'
test_patterns:
  - 'Vitest + @testing-library/react'
  - 'vi.mock for hooks; mocks return raw hook shape (isLoading, data, error)'
  - 'Component tests wrap in QueryClientProvider + MemoryRouter'
  - 'Store tests use store.setState({...}) for setup and store.getState() for assertions'
  - 'Service tests use vi.fn() fetch mock passed to StaticJsonDataService constructor'
---

# Tech-Spec: Phase A — Multi-Source Library UI + Reading

**Created:** 2026-04-18

---

## Overview

### Problem Statement

The Monkai reader currently serves only vbeta (Kinh Phật) content. A second source — vnthuquan (Sách & Truyện) — has been crawled and its `book.json` files are structurally identical to vbeta. Neither the reader nor the indexer supports selecting or switching between sources. The `BookIndexEntry` model has no top-level `source` field; the `DataService` fetches a single `/book-data/index.json`; all catalog UI is hardcoded for vbeta labels.

### Solution

Add a `source` field to `BookIndexEntry` and extend the `build-index` CLI with `--source`. In the reader, introduce a `SOURCES` config, a Zustand `useActiveSource` store, source-parameterized `getCatalog` / `useCatalogIndex`, and wire the Library page with a `SourceSelectorPill`, adaptive labels, and source badges on book cards.

### Scope

**In Scope:**
- Crawler: `source: str` on `BookIndexEntry`; `--source` option on `build-index` CLI; per-source scan root and output path
- Reader: `SOURCES` constants; `useActiveSource` Zustand store with persist; `SourceSelectorPill` component; source-parameterized catalog fetch with per-source TanStack Query cache and per-source promise cache; source-adaptive Library UI (subtitle, placeholder, count suffix); source badge on `SutraListCard` and BookmarksPage group header; `CatalogBook.source` and `Book.source` fields; `getBook(id, source)` interface change; `useCatalogIndex(source)` hook update

**Out of Scope:**
- Cross-source search (deferred)
- Source-specific reading settings
- Source management UI
- Third library integration
- Any changes to `book.schema.ts` content parsing (`normalizeParagraphs`, `decodeHtmlEntities`)

---

## Context for Development

### Codebase Patterns

**Crawler (`apps/crawler/`):**
- Pydantic v2 models in `models.py`; run with `uv run python indexer.py build-index`
- `build_book_data_index(output_dir, logger)` scans `data/book-data/` recursively for `book.json` files, derives `source` from `rel.parts[0]` (path component), and writes a single `data/book-data/index.json`
- `BookIndexEntry` currently has no top-level `source` field; `BookArtifact` does
- CLI uses Typer `@app.command(name="build-index")` pattern

**Reader (`apps/reader/src/`):**
- Zustand stores at `src/stores/` using `create<State>()(immer(...))`. UI preference stores (e.g. settings) use `persist` middleware. The new `useActiveSource` store goes at `src/shared/stores/useActiveSource.ts` (new subdirectory per PRD).
- `DataService` interface: `getCatalog(): Promise<CatalogIndex>` and `getBook(id: string): Promise<Book>`. `StaticJsonDataService` implements it with a single `catalogPromise` cache field.
- `queryKeys.catalog()` returns `['catalog']` (no source). `useCatalogIndex()` takes no params.
- `CatalogBook` and `Book` types have no `source` field.
- `catalog.schema.ts`: `rawCatalogBookSchema` has no `source`; `toCatalogBook` mapping has no `source`.
- `book.schema.ts`: `rawBookSchema` has no `source`; the `bookSchema.transform` already overrides `id` from catalog — same pattern used for `source`.
- `LibraryPage`: hardcoded subtitle "Danh mục" / "Khám phá theo thể loại...", hardcoded `{categories.length} nhóm`, calls `useCatalogIndex()` without source.
- `LibrarySearchBar`: hardcoded `placeholder="Tìm kiếm kinh điển..."`.
- `SutraListCard`: no source badge.
- `BookmarksPage`: calls `useCatalogIndex()` once, builds `coverUrlMap` from returned books. Group header renders book title only — source badge goes here.
- `ReaderPage`: calls `useBook(bookId)` and `useCatalogIndex()` (for `catalogBook` lookup). Both need source-awareness.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/crawler/models.py:270` | `BookIndexEntry` model — add `source: str` |
| `apps/crawler/models.py:287` | `BookIndex` root model |
| `apps/crawler/indexer.py:141` | `build_book_data_index` function — add `source` param |
| `apps/crawler/indexer.py:284` | `build-index` CLI command — add `--source` Typer option |
| `apps/reader/src/shared/types/global.types.ts:21` | `CatalogBook` interface |
| `apps/reader/src/shared/types/global.types.ts:38` | `Book` interface |
| `apps/reader/src/shared/schemas/catalog.schema.ts:11` | `rawCatalogBookSchema` |
| `apps/reader/src/shared/schemas/catalog.schema.ts:37` | `toCatalogBook` mapper |
| `apps/reader/src/shared/services/data.service.ts:5` | `DataService` interface |
| `apps/reader/src/shared/services/data.service.ts:81` | `StaticJsonDataService` — `catalogPromise` cache field |
| `apps/reader/src/shared/services/data.service.ts:91` | `getCatalog()` — URL + caching |
| `apps/reader/src/shared/services/data.service.ts:113` | `getBook()` — catalog lookup + fetch |
| `apps/reader/src/shared/constants/query.keys.ts:2` | `catalog` key factory |
| `apps/reader/src/shared/hooks/useCatalogIndex.ts` | Hook — no source param |
| `apps/reader/src/shared/hooks/useBook.ts` | Hook — calls `getBook(id)` |
| `apps/reader/src/features/library/LibraryPage.tsx:17` | Page — hardcoded UI |
| `apps/reader/src/features/library/LibrarySearchBar.tsx:9` | Search bar — hardcoded placeholder |
| `apps/reader/src/features/library/SutraListCard.tsx` | Book list card — no badge |
| `apps/reader/src/features/bookmarks/BookmarksPage.tsx:20` | Builds `coverUrlMap`; renders group header |
| `apps/reader/src/features/reader/ReaderPage.tsx:26` | Calls `useBook` + `useCatalogIndex` |
| `apps/reader/src/stores/bookmarks.store.ts` | Pattern reference for Zustand + immer store |
| `apps/reader/src/stores/settings.store.ts` | Pattern reference for Zustand + persist middleware |
| `apps/reader/src/shared/services/data.service.test.ts` | Service test pattern (StaticJsonDataService with fetch mock) |
| `apps/reader/src/features/library/LibraryPage.test.tsx` | Component test pattern (mocked useCatalogIndex hook) |

### Technical Decisions

1. **`SourceId` type**: `'vbeta' | 'vnthuquan'` — defined in `sources.ts` and re-exported for use across the codebase.
2. **Per-source catalog promise cache**: `StaticJsonDataService` replaces `catalogPromise: Promise<CatalogIndex> | null` with `catalogPromises: Map<SourceId, Promise<CatalogIndex>>`. Prevents redundant in-flight requests per source.
3. **Catalog URL routing**: vbeta → `/book-data/index.json` (unchanged), vnthuquan → `/book-data/vnthuquan/index.json`.
4. **`Book.source` injection**: `book.json` files have no `source` field. `StaticJsonDataService.getBook(id, source)` injects `source` from the parameter into the parsed `Book` object — same pattern as the existing `id` override (line 134 of `data.service.ts`).
5. **`useBook` source**: `useBook.ts` reads `useActiveSource()` internally and passes to `getBook`. This avoids threading source as a prop through the reader, and is safe for Phase A because the active source always matches the book being read.
6. **Zustand `useActiveSource` store location**: `src/shared/stores/useActiveSource.ts` — new subdirectory under `shared/`. Persist middleware key: `'active-source'`. Default: `'vbeta'`.
7. **BookmarksPage catalog loading**: `BookmarksPage` calls `useCatalogIndex` for BOTH sources and merges books into a unified `bookMap: Record<string, CatalogBook>`. This enables correct source badges and cover URLs for bookmarks from either source.
8. **ReaderPage**: calls `useCatalogIndex(activeSource)` — sufficient for Phase A since the reader is reached from a source-scoped catalog view.
9. **`SourceSelectorPill` clear callback**: accepts `onSourceChange?: () => void` prop; called after source switch to clear `LibraryPage` search query.
10. **`rawCatalogBookSchema` `source` field**: add as `z.string().optional()` with default `'vbeta'` for backward compatibility with older index files. In production, the indexer always populates the field.

---

## Implementation Plan

### Tasks

Tasks are ordered by dependency (data layer first, UI last).

---

#### Crawler

- [x] **Task 1: Add `source` field to `BookIndexEntry`**
  - File: `apps/crawler/models.py`
  - Action: Add `source: str` field to `BookIndexEntry` model after `artifacts: list[BookArtifact]`.
  - Notes: No default value — always explicitly set by the indexer. Full model at line 270.

- [x] **Task 2: Add `--source` option and per-source scoping to `build_book_data_index`**
  - File: `apps/crawler/indexer.py`
  - Action (function signature): Change `def build_book_data_index(output_dir: Path, logger) -> None:` to `def build_book_data_index(output_dir: Path, logger, source: str | None = None) -> None:`
  - Action (scan root): After `book_data_dir = output_dir / "book-data"`, add:
    ```python
    scan_root = book_data_dir / source if source else book_data_dir
    index_path = scan_root / "index.json"
    ```
    Replace the existing `index_path = book_data_dir / "index.json"` line.
  - Action (json_files scan): Change `json_files = sorted(p for p in book_data_dir.rglob("*.json") if p.name != "index.json")` to `json_files = sorted(p for p in scan_root.rglob("*.json") if p.name != "index.json")`
  - Action (`rel` computation): The existing `rel = file_path.relative_to(book_data_dir)` and `source = rel.parts[0]` currently derives source from path. With the new `source` param, update:
    ```python
    rel = file_path.relative_to(book_data_dir)
    derived_source = source if source else rel.parts[0]  # e.g. "vbeta" or "vnthuquan"
    ```
    Replace all subsequent uses of `source` (the derived path variable) with `derived_source`. Set `BookIndexEntry(..., source=derived_source, ...)` when constructing entries (Task 1 field).
  - Action (existing UUID map loading): When loading existing `index_path`, if it doesn't exist yet (new vnthuquan scan), gracefully return empty dict — already handled.
  - Notes: Variable name collision: the function param `source` and the derived `source = rel.parts[0]` clash. The fix is to rename the derived variable to `derived_source` throughout the function body.

- [x] **Task 3: Add `--source` option to `build-index` CLI command**
  - File: `apps/crawler/indexer.py`
  - Action: Update `build_index_cmd` function (line 284):
    ```python
    @app.command(name="build-index")
    def build_index_cmd(
        config: str = typer.Option("config.yaml", help="Config file path"),
        source: str = typer.Option(None, help="Source name to index (e.g. vnthuquan). Omit for default vbeta scan."),
    ) -> None:
        cfg = load_config(config)
        logger = setup_logger("indexer")
        build_book_data_index(Path(cfg.output_dir), logger, source=source)
    ```

---

#### Reader — Constants & Store (new files)

- [x] **Task 4: Create `sources.ts` constants file**
  - File: `apps/reader/src/shared/constants/sources.ts` *(new file)*
  - Action: Create with the following content:
    ```typescript
    export type SourceId = 'vbeta' | 'vnthuquan'

    export interface SourceConfig {
      id: SourceId
      label: string               // Display label shown to user
      searchPlaceholder: string
      subtitle: string
      countSuffix: string         // e.g. "kinh sách" for category count chip
      badgeClass: string          // Tailwind utility classes for the badge chip
    }

    export const SOURCES: SourceConfig[] = [
      {
        id: 'vbeta',
        label: 'Kinh Phật',
        searchPlaceholder: 'Tìm kiếm kinh điển...',
        subtitle: 'Khám phá kinh điển Phật giáo',
        countSuffix: 'kinh sách',
        badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
      },
      {
        id: 'vnthuquan',
        label: 'Sách & Truyện',
        searchPlaceholder: 'Tìm kiếm sách & truyện...',
        subtitle: 'Khám phá kho sách truyện tổng hợp',
        countSuffix: 'cuốn sách',
        badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      },
    ]

    export const DEFAULT_SOURCE: SourceId = 'vbeta'
    ```

- [x] **Task 5: Create `useActiveSource` Zustand store**
  - File: `apps/reader/src/shared/stores/useActiveSource.ts` *(new file, new directory)*
  - Action: Create with the following content:
    ```typescript
    import { create } from 'zustand'
    import { persist } from 'zustand/middleware'
    import type { SourceId } from '@/shared/constants/sources'
    import { DEFAULT_SOURCE } from '@/shared/constants/sources'

    interface ActiveSourceState {
      activeSource: SourceId
      setActiveSource: (source: SourceId) => void
    }

    export const useActiveSource = create<ActiveSourceState>()(
      persist(
        (set) => ({
          activeSource: DEFAULT_SOURCE,
          setActiveSource: (source) => set({ activeSource: source }),
        }),
        { name: 'active-source' }
      )
    )
    ```
  - Notes: `persist` middleware stores to localStorage under key `'active-source'`. Rehydration occurs synchronously before first render in Zustand v4+. No `immer` needed — simple flat state.

---

#### Reader — Type system

- [x] **Task 6: Add `source` to `CatalogBook` and `Book` interfaces**
  - File: `apps/reader/src/shared/types/global.types.ts`
  - Action: In `CatalogBook` interface, add `source: string` after `artifacts: CatalogArtifact[]`.
  - Action: In `Book` interface, add `source: string` after `coverImageUrl: string | null`.

- [x] **Task 7: Update `catalog.schema.ts` to parse and map `source`**
  - File: `apps/reader/src/shared/schemas/catalog.schema.ts`
  - Action: In `rawCatalogBookSchema`, add `source: z.string().optional().default('vbeta')` after the `epubUrl` field.
  - Action: In `toCatalogBook(raw)` mapper, add `source: raw.source` to the returned object.
  - Notes: `.default('vbeta')` ensures old index files without the field still parse successfully. In production, the indexer always populates `source`.

- [x] **Task 8: Update `data.service.ts` — interface, getCatalog, getBook**
  - File: `apps/reader/src/shared/services/data.service.ts`
  - Action (imports): Add `import type { SourceId } from '@/shared/constants/sources'`
  - Action (interface): Update `DataService` interface:
    ```typescript
    export interface DataService {
      getCatalog(source: SourceId): Promise<CatalogIndex>
      getBook(id: string, source: SourceId): Promise<Book>
    }
    ```
  - Action (class field): In `StaticJsonDataService`, replace `private catalogPromise: Promise<CatalogIndex> | null = null` with `private catalogPromises: Map<SourceId, Promise<CatalogIndex>> = new Map()`
  - Action (`getCatalog`): Replace implementation with:
    ```typescript
    async getCatalog(source: SourceId): Promise<CatalogIndex> {
      const existing = this.catalogPromises.get(source)
      if (existing) return existing

      const path = source === 'vbeta' ? '/book-data/index.json' : `/book-data/${source}/index.json`

      const promise = (async () => {
        try {
          const response = await this.fetchJson(path)
          const parsed = catalogSchema.safeParse(response)
          if (!parsed.success) {
            throw new DataError('parse', 'Catalog payload failed schema validation', parsed.error.flatten())
          }
          return parsed.data
        } catch (error) {
          this.catalogPromises.delete(source)
          throw error
        }
      })()

      this.catalogPromises.set(source, promise)
      return promise
    }
    ```
  - Action (`getBook`): Change signature to `async getBook(id: string, source: SourceId): Promise<Book>`. Change `const catalog = await this.getCatalog()` to `const catalog = await this.getCatalog(source)`. After `return { ...parsed.data, id }`, change to `return { ...parsed.data, id, source }`.
  - Notes: The `source` injection into the Book object (like `id`) requires `Book` to have the `source` field (Task 6). `book.json` files do NOT have a `source` field — it is always injected here.

- [x] **Task 9: Update `query.keys.ts` — source-parameterized catalog key**
  - File: `apps/reader/src/shared/constants/query.keys.ts`
  - Action: Import `SourceId` and update `catalog` key:
    ```typescript
    import type { SourceId } from '@/shared/constants/sources'

    export const queryKeys = {
      catalog: (source: SourceId) => ['catalog', source] as const,
      book: (id: string) => ['book', id] as const,
      category: (slug: string) => ['category', slug] as const,
    }
    ```

- [x] **Task 10: Update `useCatalogIndex.ts` — accept source param**
  - File: `apps/reader/src/shared/hooks/useCatalogIndex.ts`
  - Action: Replace entire file content:
    ```typescript
    import { useQuery } from '@tanstack/react-query'
    import type { SourceId } from '@/shared/constants/sources'
    import { queryKeys } from '@/shared/constants/query.keys'
    import { staticJsonDataService } from '@/shared/services/data.service'

    export function useCatalogIndex(source: SourceId) {
      return useQuery({
        queryKey: queryKeys.catalog(source),
        queryFn: () => staticJsonDataService.getCatalog(source),
      })
    }
    ```

- [x] **Task 11: Update `useBook.ts` — read active source, pass to getBook**
  - File: `apps/reader/src/shared/hooks/useBook.ts`
  - Action: Replace entire file content:
    ```typescript
    import { useQuery } from '@tanstack/react-query'
    import { queryKeys } from '@/shared/constants/query.keys'
    import { staticJsonDataService } from '@/shared/services/data.service'
    import { useActiveSource } from '@/shared/stores/useActiveSource'

    export function useBook(id: string) {
      const { activeSource } = useActiveSource()
      return useQuery({
        queryKey: queryKeys.book(id),
        queryFn: () => staticJsonDataService.getBook(id, activeSource),
        enabled: id.length > 0,
      })
    }
    ```

---

#### Reader — New component

- [x] **Task 12: Create `SourceSelectorPill` component**
  - File: `apps/reader/src/features/library/SourceSelectorPill.tsx` *(new file)*
  - Action: Create with the following content:
    ```typescript
    import { SOURCES } from '@/shared/constants/sources'
    import type { SourceId } from '@/shared/constants/sources'
    import { useActiveSource } from '@/shared/stores/useActiveSource'

    interface SourceSelectorPillProps {
      onSourceChange?: () => void
    }

    export function SourceSelectorPill({ onSourceChange }: SourceSelectorPillProps) {
      const { activeSource, setActiveSource } = useActiveSource()

      function handleSelect(id: SourceId) {
        if (id === activeSource) return
        setActiveSource(id)
        onSourceChange?.()
      }

      return (
        <div
          className="flex gap-1 rounded-full border p-1"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          role="group"
          aria-label="Chọn thư viện"
        >
          {SOURCES.map((source) => {
            const isActive = source.id === activeSource
            return (
              <button
                key={source.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleSelect(source.id)}
                className={`rounded-full px-4 py-1 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'text-[var(--color-background)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
                style={isActive ? { backgroundColor: 'var(--color-accent)' } : {}}
              >
                {source.label}
              </button>
            )
          })}
        </div>
      )
    }
    ```

---

#### Reader — Wire existing components

- [x] **Task 13: Add `placeholder` prop to `LibrarySearchBar`**
  - File: `apps/reader/src/features/library/LibrarySearchBar.tsx`
  - Action: Add `placeholder?: string` to `LibrarySearchBarProps` interface.
  - Action: Change the `<input>` placeholder attribute from the hardcoded string to `{placeholder ?? 'Tìm kiếm kinh điển...'}`.
  - Action: Change the `aria-label` on the `<input>` from the hardcoded `"Tìm kiếm kinh sách"` to a dynamic value: use the same `placeholder` prop value or a default. Update to `aria-label={placeholder ?? 'Tìm kiếm kinh sách'}`.

- [x] **Task 14: Add source badge to `SutraListCard`**
  - File: `apps/reader/src/features/library/SutraListCard.tsx`
  - Action: Add import: `import { SOURCES } from '@/shared/constants/sources'`
  - Action: Inside the component, before the return, derive badge config:
    ```typescript
    const sourceConfig = SOURCES.find((s) => s.id === book.source)
    ```
  - Action: Add the badge chip inside the existing `.min-w-0` div, after the translator `<p>` and before the closing `</div>`:
    ```typescript
    {sourceConfig && (
      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${sourceConfig.badgeClass}`}>
        {sourceConfig.label}
      </span>
    )}
    ```

- [x] **Task 15: Wire `LibraryPage` with source selector and adaptive UI**
  - File: `apps/reader/src/features/library/LibraryPage.tsx`
  - Action (imports): Add:
    ```typescript
    import { SOURCES } from '@/shared/constants/sources'
    import { useActiveSource } from '@/shared/stores/useActiveSource'
    import { SourceSelectorPill } from '@/features/library/SourceSelectorPill'
    ```
  - Action (inside component, before catalogQuery): Add:
    ```typescript
    const { activeSource } = useActiveSource()
    const sourceConfig = SOURCES.find((s) => s.id === activeSource) ?? SOURCES[0]!
    ```
  - Action (`useCatalogIndex` call): Change `const catalogQuery = useCatalogIndex()` to `const catalogQuery = useCatalogIndex(activeSource)`
  - Action (`useLibrarySearch` call): Update `clearQuery` handling to also be called when source changes — pass `clearQuery` as `onSourceChange` to `SourceSelectorPill`.
  - Action (AppBar children in success state): Add `<SourceSelectorPill onSourceChange={clearQuery} />` as a child of `<AppBar>` after `<LibrarySearchBar>` — render it below the search bar:
    ```typescript
    <AppBar ...>
      <LibrarySearchBar
        query={query}
        onQueryChange={setQuery}
        onClear={clearQuery}
        placeholder={sourceConfig.searchPlaceholder}
      />
      <div className="pb-2 pt-1">
        <SourceSelectorPill onSourceChange={clearQuery} />
      </div>
    </AppBar>
    ```
    Apply the same `<SourceSelectorPill>` in the loading and error skeleton states (loading state: render pill above skeleton; error state: render pill above error).
  - Action (subtitle): Replace hardcoded `"Khám phá theo thể loại hoặc tìm nhanh bằng từ khóa."` with `{sourceConfig.subtitle}`
  - Action (category count suffix): Replace `{categories.length} nhóm` count label area — keep `{categories.length} nhóm` for the count (the count of groups is always "nhóm"); the `countSuffix` from `sourceConfig` is used on individual `CategoryGrid` cards. Pass `countSuffix={sourceConfig.countSuffix}` as a prop to `<CategoryGrid>`.
  - Notes: `CategoryGrid` may need a `countSuffix` prop added. See Task 16.

- [x] **Task 16: Add `countSuffix` prop to `CategoryGrid`**
  - File: `apps/reader/src/features/library/CategoryGrid.tsx`
  - Action: Add `countSuffix?: string` to `CategoryGridProps` interface (default: `'kinh sách'`).
  - Action: Replace the hardcoded `"kinh sách"` string in two places:
    1. `aria-label` on the `<Link>`: change `(${category.count} kinh sách)` to `` `(${category.count} ${countSuffix ?? 'kinh sách'})` ``
    2. Count `<p>` text: change `{category.count} kinh sách` to `{category.count} {countSuffix ?? 'kinh sách'}`
  - Notes: `CategoryGrid` is a pure rendering component. Both the aria-label and visible text must use the prop.

- [x] **Task 17: Update `BookmarksPage` — load both catalogs, add source badges**
  - File: `apps/reader/src/features/bookmarks/BookmarksPage.tsx`
  - Action (imports): Add `import { SOURCES } from '@/shared/constants/sources'`
  - Action (catalog loading): Replace the single `const { data: catalog } = useCatalogIndex()` with:
    ```typescript
    const { data: vbetaCatalog } = useCatalogIndex('vbeta')
    const { data: vnthuquanCatalog } = useCatalogIndex('vnthuquan')
    ```
  - Action (`coverUrlMap` + `sourceMap`): Replace the existing `coverUrlMap` useMemo with one that merges both catalogs:
    ```typescript
    const bookMap = useMemo(() => {
      const map: Record<string, { coverUrl: string | null; source: string }> = {}
      for (const catalog of [vbetaCatalog, vnthuquanCatalog]) {
        if (!catalog) continue
        for (const book of catalog.books) {
          map[book.id] = {
            coverUrl: book.coverImageUrl ? resolveCoverUrl(book.coverImageUrl) : null,
            source: book.source,
          }
        }
      }
      return map
    }, [vbetaCatalog, vnthuquanCatalog])
    ```
  - Action (cover image render): Replace `coverUrlMap[group.bookId]` with `bookMap[group.bookId]?.coverUrl`
  - Action (source badge): In the group header `<div>` (after the book title `<span>`), add:
    ```typescript
    {(() => {
      const src = bookMap[group.bookId]?.source
      const cfg = src ? SOURCES.find((s) => s.id === src) : undefined
      return cfg ? (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badgeClass}`}>
          {cfg.label}
        </span>
      ) : null
    })()}
    ```
    Place this span after the book title `<span>` inside the flex header div, and ensure the header div has `flex-wrap` or constrains truncation correctly.

- [x] **Task 18: Update `ReaderPage` — source-aware catalog lookup**
  - File: `apps/reader/src/features/reader/ReaderPage.tsx`
  - Action (imports): Add `import { useActiveSource } from '@/shared/stores/useActiveSource'`
  - Action (inside component): Add `const { activeSource } = useActiveSource()` before the `useCatalogIndex` call.
  - Action: Change `const { data: catalog } = useCatalogIndex()` to `const { data: catalog } = useCatalogIndex(activeSource)`

---

#### Tests

- [x] **Task 19: Update `data.service.test.ts`**
  - File: `apps/reader/src/shared/services/data.service.test.ts`
  - Action: Update all `service.getCatalog()` calls to `service.getCatalog('vbeta')`. Update all `service.getBook(id)` calls to `service.getBook(id, 'vbeta')`. Update expected `Book` objects to include `source: 'vbeta'`. Update `validCatalogPayload.books[0]` to include `source: 'vbeta'` (or rely on `.default('vbeta')` in schema).
  - Notes: `StaticJsonDataService` constructor signature is unchanged.

- [x] **Task 20: Update `LibraryPage.test.tsx` mock**
  - File: `apps/reader/src/features/library/LibraryPage.test.tsx`
  - Action: Update `vi.mock` for `useCatalogIndex` to accept a source param:
    ```typescript
    vi.mock('@/shared/hooks/useCatalogIndex', () => ({
      useCatalogIndex: (_source?: string) => mockUseCatalogIndex(),
    }))
    ```
  - Action: Add `source: 'vbeta'` to `CatalogBook` in `catalogFixture.books[0]`.
  - Action: Add `vi.mock('@/shared/stores/useActiveSource', () => ({ useActiveSource: () => ({ activeSource: 'vbeta', setActiveSource: vi.fn() }) }))` to prevent Zustand persist from affecting test behavior.
  - Action: Add `vi.mock('@/features/library/SourceSelectorPill', () => ({ SourceSelectorPill: () => null }))` to stub the new pill component.

- [x] **Task 21: Update `BookmarksPage.test.tsx` mock**
  - File: `apps/reader/src/features/bookmarks/BookmarksPage.test.tsx`
  - Action: Update `vi.mock` for `useCatalogIndex` to handle two source calls:
    ```typescript
    vi.mock('@/shared/hooks/useCatalogIndex', () => ({
      useCatalogIndex: (_source?: string) => ({
        data: { books: [], categories: [] },
      }),
    }))
    ```
  - This works for existing tests since empty books means empty `bookMap`.

- [x] **Task 22: Write tests for `useActiveSource` store**
  - File: `apps/reader/src/shared/stores/useActiveSource.test.ts` *(new file)*
  - Action: Write tests covering:
    - Default active source is `'vbeta'`
    - `setActiveSource('vnthuquan')` updates state
    - State is of type `SourceId`
  - Pattern: `useActiveSource.setState({ activeSource: 'vbeta' })` in `beforeEach` to reset. Use `useActiveSource.getState()` for assertions.

- [x] **Task 23: Write tests for `SourceSelectorPill` component**
  - File: `apps/reader/src/features/library/SourceSelectorPill.test.tsx` *(new file)*
  - Action: Write tests covering:
    - Renders two pill buttons (Kinh Phật, Sách & Truyện)
    - Active button has `aria-pressed="true"`; inactive has `aria-pressed="false"`
    - Clicking inactive pill calls `setActiveSource` with new source id
    - `onSourceChange` callback is called when source changes
    - Clicking active pill does NOT call `setActiveSource` again
  - Pattern: Mock `useActiveSource` via `vi.mock`. Render with Testing Library `render()` (no QueryClient needed — no async data).

---

### Acceptance Criteria

- [x] **AC 1:** Given the app is opened for the first time, when the Library page loads, then the active source is `vbeta` (Kinh Phật) and the source selector pill shows `Kinh Phật` as pressed.

- [x] **AC 2:** Given the Library page is visible, when the user taps the `Sách & Truyện` pill, then the catalog query switches to vnthuquan, the subtitle changes to "Khám phá kho sách truyện tổng hợp", and the search placeholder changes to "Tìm kiếm sách & truyện...".

- [x] **AC 3:** Given the user has `Sách & Truyện` selected and a search query active, when the user taps `Kinh Phật`, then the search query is cleared and the category grid is shown.

- [x] **AC 4:** Given the user selects `Sách & Truyện` and closes the app, when the app is reopened and navigates to Library, then `Sách & Truyện` is still the active source (persisted via localStorage key `active-source`).

- [x] **AC 5:** Given the Library page loads with vbeta active, when the catalog is fetched and rendered, then `useCatalogIndex` is called with `'vbeta'` and the TanStack Query cache key is `['catalog', 'vbeta']`.

- [x] **AC 6:** Given the user switches from vbeta to vnthuquan and back to vbeta, when the vbeta catalog is re-displayed, then no new network request is made (served from TanStack Query in-memory cache).

- [x] **AC 7:** Given the vnthuquan catalog fetch fails (network error), when on the Library page with vnthuquan active, then the error state renders without affecting vbeta functionality.

- [x] **AC 8:** Given a book card (`SutraListCard`) for a vbeta book, when rendered in a category list, then a small indigo badge chip with label "Kinh Phật" is visible on the card.

- [x] **AC 9:** Given a book card (`SutraListCard`) for a vnthuquan book, when rendered in a category list, then a small amber badge chip with label "Sách & Truyện" is visible on the card.

- [x] **AC 10:** Given the BookmarksPage has bookmarks from both vbeta and vnthuquan, when rendered, then each group header shows a source badge matching the book's source, in the correct color (indigo for Kinh Phật, amber for Sách & Truyện).

- [x] **AC 11:** Given the user taps a vnthuquan book with vnthuquan as active source, when the ReaderPage opens, then the book loads correctly via `getBook(id, 'vnthuquan')` and chapter content renders via the existing HTML-stripping pipeline.

- [x] **AC 12:** Given `getBook(id, source)` is called, when the book JSON is parsed, then the returned `Book` object has a `source` field matching the passed `source` parameter.

- [x] **AC 13:** Given `uv run python indexer.py build-index --source vnthuquan` is run, when the command completes, then `data/book-data/vnthuquan/index.json` is written and every `BookIndexEntry` in it has `source: "vnthuquan"`.

- [x] **AC 14:** Given `uv run python indexer.py build-index` is run (no `--source`), when the command completes, then `data/book-data/index.json` is written (unchanged path) and vbeta entries have `source: "vbeta"`.

- [x] **AC 15:** Given the codebase after all changes, when `pnpm lint` is run in `apps/reader/`, then zero ESLint warnings are reported.

- [x] **AC 16:** Given the codebase after all changes, when `pnpm test` is run in `apps/reader/`, then all tests pass.

- [x] **AC 17:** Given the codebase after crawler changes, when `uv run pytest` is run in `apps/crawler/`, then all tests pass.

---

## Additional Context

### Dependencies

- **No new npm packages** — Zustand `persist` middleware is already available (see `settings.store.ts`). `immer` middleware is NOT needed for the flat `useActiveSource` state.
- **No new Python packages** — Typer optional params are already in use.
- **Internal dependencies (task order):**
  - Tasks 1–3 (crawler) are independent of reader tasks.
  - Task 4 (`sources.ts`) must precede Tasks 5, 8, 9, 10, 11.
  - Task 5 (`useActiveSource`) must precede Tasks 12, 15, 17, 18.
  - Task 6 (type system) must precede Tasks 7, 8.
  - Task 8 (`data.service.ts`) must precede Tasks 10, 11, 19.
  - Task 9 (`query.keys.ts`) must precede Tasks 10, 11.
  - Task 10 (`useCatalogIndex`) must precede Tasks 15, 17, 18, 20, 21.
  - Task 12 (`SourceSelectorPill`) must precede Task 15.
  - Task 16 (`CategoryGrid`) must precede Task 15 (or done in same commit).
  - Tasks 19–21 can be done at any point after their referenced source files.

### Testing Strategy

**Unit tests (Vitest):**
- `useActiveSource.test.ts` (Task 22) — store state transitions, default value
- `SourceSelectorPill.test.tsx` (Task 23) — aria-pressed, source switch, callback
- `data.service.test.ts` (Task 19) — update for new signatures; verify `source` on returned `Book`

**Updated component tests:**
- `LibraryPage.test.tsx` (Task 20) — mock updated hooks; verify render doesn't break
- `BookmarksPage.test.tsx` (Task 21) — mock updated hook with source param

**Manual testing (happy path):**
1. Run dev server (`devbox run dev`). Open Library — confirm Kinh Phật is active by default, pill renders.
2. Tap Sách & Truyện — confirm subtitle, placeholder, categories change.
3. Reload — confirm vnthuquan source persists.
4. Tap a vnthuquan book — confirm reader opens and displays content.
5. Open bookmarks with entries from both sources — confirm source badges appear.
6. Run `uv run python indexer.py build-index --source vnthuquan` — confirm output at `data/book-data/vnthuquan/index.json` with `source` on every entry.
7. Run `uv run pytest` in `apps/crawler/` — all pass.
8. Run `pnpm test` in `apps/reader/` — all pass.
9. Run `pnpm lint` in `apps/reader/` — zero warnings.

### Notes

**High-risk items:**
- **Task 2 (indexer variable name collision)**: The function param `source: str | None` clashes with the existing local `source = rel.parts[0]` derivation. This MUST be renamed to `derived_source` throughout `build_book_data_index` to avoid a silent override bug.
- **Task 8 (DataService interface change)**: Changing `getCatalog()` and `getBook(id)` signatures breaks the `DataService` interface. Any code that uses `DataService` as a type (not `StaticJsonDataService` directly) must be updated. Check `@/shared/services/data.service.ts` usage across the codebase with a quick grep before and after.
- **Task 15 (LibraryPage complexity)**: The source selector pill must appear in ALL three render paths (loading skeleton, error state, success state). Missing it in one branch creates a broken UX where the pill disappears on load/error.
- **Task 16 (CategoryGrid countSuffix)**: Read `CategoryGrid.tsx` before implementing — the count label may be rendered in a child component. Don't assume its structure; read it first.
- **`book.schema.ts` NOT modified**: The `Book` type gains `source`, but `rawBookSchema` does NOT need a `source` field. The `source` is injected by `StaticJsonDataService.getBook` post-parse (same as `id`). Do not add a `source` field to `rawBookSchema` — vnthuquan `book.json` files don't have it.
- **Zustand persist rehydration**: If tests import `useActiveSource` and the persist middleware tries to hit localStorage, it may interfere. Mock `useActiveSource` in component tests (Tasks 20, 21) to avoid this.
