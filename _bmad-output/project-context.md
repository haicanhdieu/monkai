---
project_name: 'monkai'
user_name: 'Minh'
date: '2026-03-13'
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - quality_rules
  - workflow_rules
  - anti_patterns
  - reader_epub_flow
status: complete
rule_count: 42
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

**Monkai** is a monorepo: **Phase 1 Crawler** (`apps/crawler`, Python) ingests and indexes Buddhist scriptures; **Phase 2 Reader** (`apps/reader`, React/Vite) is a PWA that consumes that corpus. The handoff contract is `index.json` plus per-book JSON; reader Zod schemas must stay aligned with crawler output.

---

## Technology Stack & Versions

### Monorepo & tooling

- **Root:** `devbox.json` — Python 3.11, uv, Node.js, pnpm; scripts run from repo root via `devbox run <script>`.
- **Scripts:** `crawl` / `pipeline` / `build-books` / `test:crawler` → `apps/crawler`; `dev` / `build` / `test` / `lint` → `apps/reader`; `deploy:book-data` / `deploy:reader` / `deploy:all` → `apps/deployer`. Run crawler tests with `devbox run test:crawler`, reader tests with `devbox run test`. Deployment: `devbox run deploy:book-data`, `devbox run deploy:reader`, `devbox run deploy:all` (see `apps/deployer/README.md`).

### Reader (`apps/reader`)

- **Runtime:** React 18.3.x, React DOM 18.3.x
- **Build:** Vite 7.x, TypeScript ~5.9.3 (strict, ESNext, bundler moduleResolution)
- **State:** Zustand 5.x with `immer`; TanStack React Query 5.x for catalog/cache
- **Validation:** Zod 4.x in `shared/schemas/`
- **Storage:** localforage 1.x — **only** via `@/shared/services/storage.service`
- **UI:** Tailwind 3.x, Radix UI, @fontsource (Inter, Lora); **Search:** MiniSearch 7.x
- **EPUB:** epub.js 0.3.x for rendering; JSZip 3.x for building EPUB in memory from JSON (see Reader EPUB flow below)
- **PWA:** vite-plugin-pwa, Workbox (broadcast-update, core, window); **Routing:** react-router-dom 7.x
- **Testing:** Vitest 4.x, @testing-library/react 16.x, jsdom; Playwright for e2e
- **Lint:** ESLint 9.x, typescript-eslint 8.x; `eslint src --max-warnings 0`

### Crawler (`apps/crawler`)

- **Python:** 3.11+; **Package manager:** uv (root `pyproject.toml`, deps apply to crawler)
- **Dependencies:** aiohttp, beautifulsoup4, pydantic (v2), pyyaml, typer, requests; playwright for browser-based crawl when needed
- **Dev:** pytest 9.x, pytest-asyncio, ruff (lint + format). **Test paths:** `apps/crawler/tests` (in root `pyproject.toml`)
- **Execution context:** All crawler commands run with CWD = `apps/crawler` (e.g. `cd apps/crawler && uv run python crawler.py`). Imports are unqualified: `from models import ...`, `from utils.config import load_config` — no `apps.crawler` package prefix.
- **Config:** Single source of truth is `apps/crawler/config.yaml`; loaded via `utils.config.load_config`. New sources are added by editing `config.yaml` only (no code changes for new site).

---

## Critical Implementation Rules

### Monorepo & data contract

- **Data flow:** Crawler writes to `apps/crawler/data/book-data/` (e.g. `index.json`, `vbeta/.../book.json`). Reader fetches `/book-data/*` (proxy `VITE_BOOK_DATA_URL` in dev or static hosting). Schema contract: reader's Zod schemas in `shared/schemas/` must validate crawler output; crawler uses Pydantic models in `models.py`; keep field names and shapes aligned (reader may use `.transform()` for snake_case → camelCase at schema boundary).
- **Root config:** Python deps and pytest/ruff live in root `pyproject.toml`; `testpaths = ["apps/crawler/tests"]`. Reader has its own `apps/reader/package.json` and tooling.
- **Devbox:** Use `devbox run <script>` from repo root. Do not assume CWD is an app directory unless the script explicitly `cd`s into it.

### Reader-specific (TypeScript/React)

- **TypeScript:** `tsconfig.app.json`: strict, noUnusedLocals, noUnusedParameters, verbatimModuleSyntax. Path alias `@/*` → `./src/*` only. Prefer `@/shared/...`, `@/features/...`, `@/stores/...`, `@/lib/...`.
- **State:** Zustand stores in `stores/` with `immer`; persist only via `storageService` and a single `hydrate` from storage. **Storage (mandatory):** Do not use `localStorage`, `indexedDB`, or `import ... from 'localforage'`; use `StorageService` from `@/shared/services/storage.service` only (enforced by ESLint).
- **Routing:** `shared/constants/routes.ts` (ROUTES, toRead, toCategory); lazy-loaded page components; reader route hides bottom nav (`pathname.startsWith('/read/')`).
- **Data:** Validate book/catalog with Zod in `shared/schemas/`; use `useBook`, `useCatalogIndex`, `useCatalogSync` for catalog access. PWA/Workbox config in `vite.config.ts`; respect `VITE_BASE_PATH`.
- **Reader EPUB flow:** `epubUrl` comes from (1) catalog `epubUrl` when present, or (2) built from JSON when absent: `useEpubFromBook(book)` builds EPUB in memory via `bookToEpubBuffer(book)` from `@/shared/lib/bookToEpub`, caches the blob with `epubBlobCacheKey(bookId)` (see `storage.keys.ts`), and exposes a blob URL; revoke the blob URL on cleanup. `useEpubReader(epubUrl)` accepts both `blob:` URLs (fetch → ArrayBuffer → epub.js) and regular URLs. Do not use `localStorage`/indexedDB/localforage directly; cache EPUB blobs only via `StorageService` and the keys in `storage.keys.ts`.
- **Shared lib:** `@/shared/lib/bookToEpub.ts` builds a minimal EPUB 2.0 from `Book` (JSZip); mirrors structure of `scripts/build-epubs.mjs`. Use `sanitizeXml` for XML 1.0 forbidden control characters and `xmlEscape` for content; keep in sync with build-time script where both produce EPUB.
- **Storage keys:** `storage.keys.ts` defines `STORAGE_KEYS`, `EPUB_BLOB_CACHE_PREFIX`, and `epubBlobCacheKey(bookId)`. Bump `EPUB_BLOB_CACHE_PREFIX` version (e.g. `epub_blob_v2_`) when EPUB generation logic changes so stale blobs don’t mask fixes.
- **Tests:** Vitest; colocated `*.test.ts(x)`; `test-setup.ts` (jest-dom, ResizeObserver mock); `vi.mock` + `data-testid` for mocked components. For `useEpubFromBook` / `bookToEpub`: mock `StorageService` and `bookToEpubBuffer`; stub `URL.createObjectURL`/`revokeObjectURL` when testing blob URLs. Run `pnpm test` and `pnpm lint` (zero warnings).
- **Structure:** `src/features/<feature>/`, `src/shared/` (components, hooks, services, constants, schemas, types, **lib**), `src/stores/`, `src/lib/`. PascalCase components; default export only for page components used by router.
- **i18n:** Vietnamese UI strings (e.g. "Cài Đặt", "Đọc kinh Phật"); keep consistent with existing locale.

### Crawler-specific (Python)

- **Structure:** Entry scripts at `apps/crawler/` root: `crawler.py`, `pipeline.py`, `indexer.py`, `validate.py`, `book_builder.py`, `parser.py`, `models.py`. Utilities in `utils/` (e.g. `config`, `dedup`, `logging`, `robots`, `slugify`, `state`, `api_adapter`). Tests in `tests/`; `conftest.py` for fixtures (e.g. `sample_metadata_fields`, `tmp_state_file`).
- **Config:** All pipeline behaviour from `config.yaml`; use `utils.config.load_config`. Rate limits, sources, API endpoints, CSS selectors live in config. Enforce minimum rate limit (e.g. ≥ 1.0 s) in Pydantic validators.
- **Models:** Pydantic v2 in `models.py`; use `BaseModel`, `ConfigDict`, `Field`, `field_validator`. Key models: `SourceConfig`, `CrawlerConfig`, `ScriptureMetadata`, `IndexRecord`; category literals `Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]`. Datetimes timezone-aware (UTC).
- **IDs:** Deterministic IDs via `utils/slugify.py` (e.g. `make_id`, Vietnamese-aware); format like `{source_slug}__{title_slug}`. Deduplication via `utils/dedup.py` (e.g. SHA-256).
- **Crawl state:** Incremental/resumable state in `data/crawl-state.json`; use `utils.state.CrawlState`. Robots: `utils.robots` (robots.txt caching, USER_AGENT); respect robots.txt.
- **Pipeline:** `pipeline.py` runs stages in order: crawler → build-index (indexer) → validate. Subprocess calls assume CWD is `apps/crawler`; use `uv run python <script>`.
- **Testing:** pytest; add `apps/crawler` to `sys.path` in `conftest.py` so imports like `from models import ...` work. Use fixtures for isolated state (e.g. `tmp_path` for crawl state). Run with `devbox run test:crawler` or `cd apps/crawler && uv run pytest`.
- **Lint/format:** Ruff; run from crawler dir or via devbox. Exclude `.devbox`, `.venv` in ruff config (root `pyproject.toml`).

### Code quality & style (both apps)

- **Reader:** ESLint with zero warnings; no direct storage or localforage; naming and structure as above.
- **Crawler:** Ruff check and format; Pydantic for all external/config data; no new sources without config.yaml changes (single source of truth).

### Critical don't-miss rules

- **Reader:** Never use `localStorage`/`indexedDB`/localforage directly; always StorageService. Validate all book/catalog data with Zod. Reader route = chromeless layout, no bottom nav. When changing EPUB-from-JSON logic in `bookToEpub.ts`, bump `EPUB_BLOB_CACHE_PREFIX` in `storage.keys.ts` so cached blobs are invalidated.
- **Crawler:** Never add a new crawl source by only changing code; add an entry to `config.yaml` and keep logic generic. Run all scripts with CWD = `apps/crawler`. Use `load_config()` for any path or source list.
- **Contract:** Changes to crawler output shape (e.g. `index.json`, book JSON) must be reflected in reader Zod schemas (and vice versa if reader drives contract). Document any intentional snake_case in crawler → camelCase in reader at schema boundary.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing code. Determine which app (reader vs crawler) or monorepo you are changing.
- Follow app-specific and monorepo rules; when in doubt, prefer the more restrictive option (e.g. StorageService, config-driven sources, aligned schemas).

**For Humans:**

- Keep this file lean; update when stack or conventions change; review periodically.

Last Updated: 2026-03-13
