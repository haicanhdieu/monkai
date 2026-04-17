# Multi-Source Library UI — Feature Spec

**Status:** Draft  
**Date:** 2026-04-17  
**Scope:** Phase A — Library UI + catalog only. Book reading for vnthuquan deferred to Phase B.

---

## 1. Background

The app currently has one book source: **vbeta** (Kinh Phật — Buddhist scriptures). A second source, **vnthuquan** (Sách & Truyện — general fiction/stories), has been crawled and test data is available at `apps/crawler/data/book-data/vnthuquan/`. The two sources have different category systems and different content audiences.

This spec covers how users select a source and how the library UI (categories, book listing, search) adapts to the active source.

---

## 2. User-Facing Design

### 2.1 Source Labels (no internal IDs in UI)

| Internal ID  | Display Label   |
|---|---|
| `vbeta`      | Kinh Phật       |
| `vnthuquan`  | Sách & Truyện   |

Technical source IDs are never shown to users.

### 2.2 Library Page Layout

```
┌─────────────────────────────────────────┐
│ [🪷]        Thư Viện         [👤]       │  ← AppBar (unchanged)
│ ┌─────────────────────────────────────┐ │
│ │ 🔍  Tìm kiếm kinh điển...       [x]│ │  ← SearchBar (placeholder adapts)
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ [■ Kinh Phật ]  [ Sách & Truyện ]      │  ← SourceSelectorPill (compact, 32px)
│                                         │
│ Danh mục                      8 nhóm   │  ← count = active source only
│ Khám phá kinh điển Phật giáo           │  ← subtitle adapts to source
│                                         │
│ ┌──────────────┐  ┌──────────────┐     │
│ │ Kinh Nikāya  │  │ Kinh Đại Thừa│     │  ← categories scoped to source
│ │    › 245     │  │    › 189     │     │
│ └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────┘
```

**When vnthuquan is active:**

```
│ [ Kinh Phật ]  [■ Sách & Truyện ]     │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔍  Tìm kiếm sách & truyện...   [x]│ │  ← placeholder changes
│ └─────────────────────────────────────┘ │
│                                         │
│ Danh mục                     15 nhóm   │
│ Khám phá kho sách truyện tổng hợp      │
│                                         │
│ ┌──────────────┐  ┌──────────────┐     │
│ │  Kiếm Hiệp   │  │  Ngôn Tình   │     │
│ │    › 312     │  │    › 478     │     │
│ └──────────────┘  └──────────────┘     │
```

### 2.3 Source Selector Component Spec

- Position: below SearchBar, above category grid — `px-4 py-2`
- Two pill buttons, `py-1 px-4 rounded-full text-sm font-medium`
- **Active pill:** filled accent background, white text
- **Inactive pill:** ghost style — muted border, muted text
- Tapping inactive pill: switches source, clears search query, resets to category grid
- Source preference persists across tab navigation and app restarts (localStorage)

### 2.4 Search Bar Placeholder

| Active Source | Placeholder |
|---|---|
| `vbeta`      | `Tìm kiếm kinh điển...`   |
| `vnthuquan`  | `Tìm kiếm sách & truyện...` |

Search is scoped to active source only. Cross-source search deferred to v2.

### 2.5 Category Grid Labels

| Active Source | Count label suffix |
|---|---|
| `vbeta`      | `kinh sách`  |
| `vnthuquan`  | `cuốn sách`  |

### 2.6 Source Badge on Book Cards

Every book card (in bookmark shelf and category book lists) shows a small source chip:

```
┌─────────────────────────────────────────┐
│ ┌──────┐  Kinh Trung Bộ               › │
│ │[cover│  Thích Minh Châu               │
│ │ img ]│  [Kinh Phật]   Kinh Điển      │  ← indigo muted chip
│ └──────┘                                │
├─────────────────────────────────────────┤
│ ┌──────┐  Vô Tận Vũ Trang            › │
│ │[cover│  duyên phận 0                  │
│ │ img ]│  [Sách & Truyện]  Khoa Huyễn  │  ← amber muted chip
│ └──────┘                                │
└─────────────────────────────────────────┘
```

- vbeta chip: indigo, muted
- vnthuquan chip: amber, muted
- Bookmarks remain a **unified shelf** — source badge is provenance info only, not a filter
- Display label from `SOURCES` config — not raw ID

### 2.7 Home Screen

Unchanged. Recent reads show their source badge naturally. Daily Dharma is source-agnostic.

---

## 3. Source Configuration

New shared constants file — single source of truth for labels and metadata:

**`apps/reader/src/shared/constants/sources.ts`**

```ts
export const SOURCES = [
  {
    id: 'vbeta',
    label: 'Kinh Phật',
    searchPlaceholder: 'Tìm kiếm kinh điển...',
    subtitle: 'Khám phá kinh điển Phật giáo',
    countSuffix: 'kinh sách',
    badgeColor: 'indigo',   // Tailwind color token
  },
  {
    id: 'vnthuquan',
    label: 'Sách & Truyện',
    searchPlaceholder: 'Tìm kiếm sách & truyện...',
    subtitle: 'Khám phá kho sách truyện tổng hợp',
    countSuffix: 'cuốn sách',
    badgeColor: 'amber',
  },
] as const

export type SourceId = typeof SOURCES[number]['id']
export const DEFAULT_SOURCE: SourceId = 'vbeta'
```

---

## 4. Data Architecture

### 4.1 Index File Structure (Crawler Output)

**Option chosen: Separate index per source** — vbeta index stays untouched, vnthuquan gets its own index at the same schema.

```
apps/crawler/data/book-data/
  index.json                   ← vbeta only (existing, schema v1.0, unchanged)
  vnthuquan/
    index.json                 ← vnthuquan only (new, same schema v1.0)
    khoa-huyen-gia-tuong/
      vo-tan-vu-trang/
        book.json
    tien-hiep-tu-chan/
      .../book.json
  vbeta/
    kinh/
      .../book.json
```

Both index files share the same `BookIndex` schema. The reader loads a different path based on active source.

### 4.2 `BookIndexEntry` — Add `source` field

**`apps/crawler/models.py`**

```python
class BookIndexEntry(BaseModel):
    id: str
    source: str                 # ← NEW: "vbeta" or "vnthuquan"
    source_book_id: str
    book_name: str
    book_seo_name: str
    cover_image_url: str | None = None
    author: str | None = None
    publisher: str | None = None
    publication_year: int | None = None
    category_id: int
    category_name: str
    category_seo_name: str
    total_chapters: int
    artifacts: list[BookArtifact]
```

### 4.3 Indexer — Scope by Source

**`apps/crawler/indexer.py:build_book_data_index`**

Accept optional `source` param to scope scan directory and output path:

```python
def build_book_data_index(output_dir: Path, logger, source: str | None = None) -> None:
    book_data_dir = output_dir / "book-data"
    scan_root = book_data_dir / source if source else book_data_dir
    index_path = scan_root / "index.json"
    # ... rest unchanged, but populate BookIndexEntry.source = source or rel.parts[0]
```

CLI:
```bash
uv run python indexer.py build-index                        # vbeta (existing behavior)
uv run python indexer.py build-index --source vnthuquan    # vnthuquan/index.json
```

---

## 5. Reader — Change Inventory

### 5.1 Types

**`apps/reader/src/shared/types/global.types.ts`**

```ts
export interface CatalogBook {
  id: string
  title: string
  source: string          // ← NEW: "vbeta" | "vnthuquan"
  category: string
  categorySlug: string
  subcategory: string
  translator: string
  coverImageUrl: string | null
  artifacts: CatalogArtifact[]
  epubUrl?: string
}
```

### 5.2 Catalog Schema

**`apps/reader/src/shared/schemas/catalog.schema.ts`**

```ts
// rawCatalogBookSchema — add:
source: z.string(),

// toCatalogBook() — add mapping:
source: raw.source,
```

### 5.3 Data Service

**`apps/reader/src/shared/services/data.service.ts`**

```ts
interface DataService {
  getCatalog(source: SourceId): Promise<CatalogIndex>   // ← add source param
  getBook(id: string): Promise<Book>
}

// StaticJsonDataService.getCatalog():
async getCatalog(source: SourceId): Promise<CatalogIndex> {
  const path = source === 'vbeta'
    ? '/book-data/index.json'
    : `/book-data/${source}/index.json`
  // ... fetch + parse as before
}
```

Catalog promise cache must be keyed by source:
```ts
private catalogPromises = new Map<SourceId, Promise<CatalogIndex>>()
```

### 5.4 Query Keys

**`apps/reader/src/shared/constants/query.keys.ts`**

```ts
export const queryKeys = {
  catalog: (source: SourceId) => ['catalog', source] as const,  // ← add source
  book: (id: string) => ['book', id] as const,
  category: (slug: string) => ['category', slug] as const,
}
```

### 5.5 useCatalogIndex Hook

**`apps/reader/src/shared/hooks/useCatalogIndex.ts`**

```ts
export function useCatalogIndex(source: SourceId) {
  return useQuery({
    queryKey: queryKeys.catalog(source),
    queryFn: () => staticJsonDataService.getCatalog(source),
  })
}
```

### 5.6 Active Source Store (new)

**`apps/reader/src/shared/stores/useActiveSource.ts`**

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_SOURCE, type SourceId } from '@/shared/constants/sources'

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
    { name: 'active-source' }   // localStorage key
  )
)
```

---

## 6. New UI Components

### 6.1 SourceSelectorPill (new)

**`apps/reader/src/features/library/SourceSelectorPill.tsx`**

```tsx
// Props: none — reads/writes useActiveSource internally
// Clears search query via callback prop: onSourceChange?: () => void
```

Renders two pill buttons from `SOURCES`. Active = filled accent, inactive = ghost. On click: `setActiveSource(id)` + `onSourceChange?.()`.

### 6.2 LibrarySearchBar — add placeholder prop

**`apps/reader/src/features/library/LibrarySearchBar.tsx`**

```ts
interface LibrarySearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  onClear: () => void
  placeholder?: string    // ← NEW, defaults to existing hardcoded value
}
```

### 6.3 SutraListCard — add source badge

**`apps/reader/src/features/library/SutraListCard.tsx`**

- Render small chip below title/author using `book.source`
- Resolve display label and color from `SOURCES` config
- Style: `text-xs px-2 py-0.5 rounded-full` with source-appropriate muted color

### 6.4 LibraryPage — wire everything

**`apps/reader/src/features/library/LibraryPage.tsx`**

```tsx
const { activeSource, setActiveSource } = useActiveSource()
const catalogQuery = useCatalogIndex(activeSource)       // ← pass source
const sourceConfig = SOURCES.find(s => s.id === activeSource)!

// Render SourceSelectorPill below SearchBar
// Pass sourceConfig.searchPlaceholder to LibrarySearchBar
// Pass sourceConfig.subtitle and sourceConfig.countSuffix to category header
// On source change: clearQuery()
```

---

## 7. Phase B — vnthuquan Book Reading (deferred)

vnthuquan `book.json` contains inline HTML chapter content — a different shape from vbeta's `Book` model. Reading vnthuquan books requires:

- A new or extended `book.schema.ts` to parse HTML chapters
- HTML → `BookParagraph[]` transformation (strip tags or render HTML)
- Potential reader UI changes for chapter navigation

**For Phase A:** vnthuquan books in category/search listings show normally. The read button can show a *"Sắp ra mắt"* (coming soon) state or be disabled based on `book.source === 'vnthuquan'`.

---

## 8. Summary of Changes

### Crawler (Python)

| File | Change | Lines |
|---|---|---|
| `models.py` | Add `source: str` to `BookIndexEntry` | +1 |
| `indexer.py` | `build_book_data_index(source=None)` scopes scan + output | ~8 |
| CLI | Add `--source` option to `build-index` command | ~3 |

### Reader (TypeScript/React)

| File | Change | Type |
|---|---|---|
| `shared/constants/sources.ts` | Source config constants | New |
| `shared/stores/useActiveSource.ts` | Zustand store with persistence | New |
| `features/library/SourceSelectorPill.tsx` | Pill toggle component | New |
| `shared/types/global.types.ts` | Add `source` to `CatalogBook` | Edit (+1) |
| `shared/schemas/catalog.schema.ts` | Parse + map `source` field | Edit (+2) |
| `shared/services/data.service.ts` | `getCatalog(source)`, per-source cache | Edit (~8) |
| `shared/constants/query.keys.ts` | `catalog(source)` key | Edit (+1) |
| `shared/hooks/useCatalogIndex.ts` | Accept `source` param | Edit (+2) |
| `features/library/LibraryPage.tsx` | Wire source selector | Edit (~12) |
| `features/library/LibrarySearchBar.tsx` | `placeholder` prop | Edit (+2) |
| `features/library/SutraListCard.tsx` | Source badge chip | Edit (~8) |

**Total:** 3 new files, 8 edited files, ~45 net lines changed.
