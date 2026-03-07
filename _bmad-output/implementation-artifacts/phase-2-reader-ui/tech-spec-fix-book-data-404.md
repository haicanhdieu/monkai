---
title: 'Fix book-data 404 error'
slug: 'fix-book-data-404'
created: '2026-03-07T15:52:00+07:00'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Node.js', 'Vite', 'React', 'TypeScript']
files_to_modify: ['apps/reader/src/shared/services/data.service.ts']
code_patterns: ['ES modules', 'Data Service', 'Catalog lookup']
test_patterns: ['Manual testing via browser']
---

# Tech-Spec: Fix book-data 404 error

**Created:** 2026-03-07T15:52:00+07:00

## Overview

### Problem Statement

Book data cannot be loaded, resulting in a 404 error when trying to fetch `/book-data/{uuid}.json`. In a static file hosting environment, the individual book JSON files are not stored at `{uuid}.json` at the root of `book-data`. They are stored in nested paths like `vbeta/kinh/.../book.json` as defined in the catalog's `artifacts` array. The Reader UI needs to resolve these paths dynamically rather than assuming `{uuid}.json`.

### Solution

Update `StaticJsonDataService` in `apps/reader/src/shared/services/data.service.ts`. Instead of directly fetching `/book-data/{id}.json`, the `getBook` method must first obtain the catalog, find the book by its `id`, locate the JSON artifact's `path`, and fetch from `/book-data/${artifact.path}`. To avoid repeatedly fetching the large `index.json` file on every book load, the catalog request should be cached in memory.

### Scope

**In Scope:**
- `apps/reader/src/shared/services/data.service.ts`

**Out of Scope:**
- Other mock server features or UI changes.

## Context for Development

### Codebase Patterns

- **Data Service**: The `StaticJsonDataService` is a class that implements `DataService` and handles network calls.
- **Catalog Structure**: The `index.json` returns an object with `_meta` and `books`. Each `book` entry contains `artifacts`, one of which has `format: "json"` and a `path` property.
- **Error Handling**: Uses custom `DataError` class for all data-related errors.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| apps/reader/src/shared/services/data.service.ts | The data service where `getBook` is implemented. |

### Technical Decisions

- **In-Memory Caching**: We will cache the promise returned by `getCatalog()` in `StaticJsonDataService` to prevent multiple concurrent or subsequent network requests for `index.json`.
- **Path Resolution**: We will use the `format: 'json'` artifact's `path` relative to `baseUrl/book-data/...` to fetch the book content.

## Implementation Plan

### Tasks

- [x] Task 1: Add catalog caching to StaticJsonDataService
  - File: `apps/reader/src/shared/services/data.service.ts`
  - Action: Add a private class property `catalogPromise: Promise<CatalogIndex> | null = null`. Update `getCatalog()` to instantiate this promise once, returning `this.catalogPromise`. If it rejects, clear the cache.
- [x] Task 2: Update `getBook` to use catalog for path resolution
  - File: `apps/reader/src/shared/services/data.service.ts`
  - Action: In `getBook(id)`, first `await this.getCatalog()`. Find the book in `catalog.books` by `id`. If not found, throw `DataError('not_found')`. Find the artifact with `format === 'json'`. If not found, throw `DataError('not_found')`. Fetch the JSON from `/book-data/${artifact.path}`.

### Acceptance Criteria

- [ ] AC 1: Given a requested book ID, when `getBook` is called, it fetches the actual file path from the catalog instead of `{uuid}.json`.
- [ ] AC 2: Given multiple calls to `getCatalog` or `getBook`, when they resolve, `index.json` is fetched only once over the network.
- [ ] AC 3: Given a book ID that doesn't exist in the catalog, when `getBook` is called, it throws a `not_found` DataError before attempting a network request.

## Additional Context

### Dependencies

- **Data source**: Valid `index.json` and nested book files from the crawler output.

### Testing Strategy

- **Manual Testing**:
  1. Start the mock server: `cd apps/reader && npm run mock-server` (or run `./codex.sh` script)
  2. Start the Reader UI: `cd apps/reader && npm run dev`
  3. Open DevTools Network tab.
  4. Navigate to a book page in the browser (e.g., `http://localhost:5173/book/ef2771e3-ea9e-48bd-bcdd-5b39d89a2491`).
  5. Verify `index.json` is loaded exactly once.
  6. Verify the book payload is loaded from `vbeta/kinh/.../book.json` instead of the UUID path, and the content displays correctly.

### Notes

- Because the UI now resolves the path natively via the catalog, it perfectly matches the production static-hosting environment.
