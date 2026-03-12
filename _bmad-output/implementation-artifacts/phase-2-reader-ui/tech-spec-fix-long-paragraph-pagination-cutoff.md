---
title: 'Fix long paragraph cutoff in reader pagination'
slug: 'fix-long-paragraph-pagination-cutoff'
created: '2026-03-11'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'TypeScript', 'Vite 7', 'Vitest', 'Playwright', 'Zustand', 'TanStack Query v5']
files_to_modify:
  - 'apps/reader/src/features/reader/useDOMPagination.ts'
  - 'apps/reader/src/lib/pagination/paginateBook.ts'
  - 'apps/reader/src/lib/pagination/paginateBook.test.ts'
  - 'apps/reader/src/features/reader/ReaderEngine.test.tsx'
  - 'apps/reader/e2e/reader-layout.spec.ts'
code_patterns:
  - 'DOM measurement via hidden div with scrollHeight vs clientHeight'
  - 'Paragraph-level page boundaries with boundary index tracking'
  - 'sessionStorage caching keyed by bookId+viewport+font'
  - 'Two-tier pagination: DOM-based (prod) + line-count estimation (fallback/test)'
  - 'ResizeObserver for responsive re-pagination'
test_patterns:
  - 'Vitest + jsdom with mocked scrollHeight/clientHeight'
  - 'Content preservation invariant: concatenated pages === original paragraphs'
  - 'Boundary monotonicity: boundaries always increasing'
  - 'Performance: 500 paragraphs in <500ms'
---

# Tech-Spec: Fix long paragraph cutoff in reader pagination

**Created:** 2026-03-11

## Overview

### Problem Statement

In the reader app, when a `<p>` element's content is taller than the viewport, the pagination logic (`useDOMPagination.ts`) places the entire paragraph on a single page without splitting it. The render container uses `overflow-hidden`, so any content beyond the viewport is clipped and invisible to the user. This causes **content loss** — the user misses text with no way to see it.

Example: On a 375x667 viewport, a long paragraph renders at 327x809 (142px taller than the page), cutting off the bottom portion entirely.

The same bug exists in `paginateBook.ts` (fallback line-count estimator) — it also never splits mid-paragraph.

### Solution

Modify `measurePages()` in `useDOMPagination.ts` to detect when a single paragraph exceeds the available page height, then iteratively split it into sub-strings that each fit within one page. Use DOM measurement (appending text word-by-word) to find the precise split point. Loop until all remaining text fits, handling paragraphs that span 3+ pages.

Apply an equivalent fix to `paginateBook()` for the fallback path using line-count estimation.

**Critical invariant: zero content loss — every character of every paragraph must appear on some page.**

### Scope

**In Scope:**
- Splitting overlong paragraphs in `measurePages()` using iterative DOM measurement
- Splitting overlong paragraphs in `paginateBook()` using line-count estimation
- Handling paragraphs spanning any number of pages (not just 2)
- Updating existing tests and adding new test cases for the split logic
- Ensuring split text flows naturally with no visual indicators needed

**Out of Scope:**
- Scroll-based reading mode
- Visual split indicators (ellipsis, continuation marks)
- Changes to bookmark/page-tracking logic (split sub-pages share parent boundary index)
- Changes to `ReaderEngine.tsx` rendering (split paragraphs are just strings)
- Changes to types, stores, or content pipeline

## Context for Development

### Codebase Patterns

- **Two-tier pagination**: `useDOMPagination.ts` (production, DOM measurement) and `paginateBook.ts` (fallback, line-count estimation). Both need the fix.
- **Paragraph-level granularity**: Pages are `string[][]` — array of pages, each page is array of paragraph strings. Currently never splits mid-paragraph.
- **Boundary tracking**: `boundaries[i]` = index of first original paragraph on page `i`. Used for bookmarks. Split sub-pages must share the same boundary index as their parent paragraph.
- **Cache key**: `pagination:{bookId}:{paragraphCount}:{vw}x{vh}:{fontSize}:{lineHeight}` — uses paragraph count (input), not page count (output), so splitting doesn't break cache.
- **Measurement div styles**: fontSize, lineHeight (1.6), fontFamily (Lora, serif), marginBottom (1rem), overflowWrap (anywhere), wordBreak (break-word) — applied in `measurePages()` on each `<p>` element.
- **Cover page**: Page 0 is always cover. Content pages start at index 1. `totalDisplayPages = 1 + pages.length`.
- **paginateBook line estimation**: Currently `paraLines = 1` for every paragraph (line 43). Needs to estimate actual line count for splitting.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/features/reader/useDOMPagination.ts` | Main DOM-based pagination — `measurePages()` function (lines 39-97). **Primary fix location.** |
| `apps/reader/src/lib/pagination/paginateBook.ts` | Fallback line-count pagination (63 lines). **Secondary fix location.** |
| `apps/reader/src/lib/pagination/pagination.types.ts` | `PageBoundaries`: `{ pages: string[][], boundaries: number[] }`, `PaginationOptions`, `DOMPaginationOptions` |
| `apps/reader/src/lib/pagination/paginateBook.test.ts` | 7 test suites, content preservation checks `flat().toEqual(paragraphs)` |
| `apps/reader/src/features/reader/ReaderEngine.tsx` | Renders pages with `overflow-hidden`, measurement div setup, font styles |
| `apps/reader/src/features/reader/ReaderEngine.test.tsx` | Integration tests with mocked scrollHeight/clientHeight |
| `apps/reader/src/stores/reader.store.ts` | Zustand store — `pages: string[][]`, `pageBoundaries: number[]`, `currentPage` |

### Technical Decisions

- **Iterative word-based splitting for DOM path**: Split by words (spaces). Add words to a `<p>` in the measurement div one by one until `scrollHeight > clientHeight`, then cut before the overflowing word. Loop on the remainder until it fits. Accurate for variable-width Lora serif font.
- **Line-count estimation for fallback path**: Estimate `charsPerLine` from available width and average char width (`fontSize * 0.6`). Compute `paraLines = ceil(para.length / charsPerLine)`. If `paraLines > maxLinesPerPage`, split by words at estimated line boundaries.
- **Shared boundary index for split sub-pages**: All sub-pages from one original paragraph use that paragraph's index as their boundary. This preserves bookmark accuracy.
- **Existing content preservation tests unchanged**: Short paragraphs (70 × ~50 chars) with `maxLinesPerPage=32` never trigger splitting, so `flat().toEqual(paragraphs)` still holds. New overlong tests use `flat().join(' ')` invariant instead.

## Implementation Plan

### Tasks

- [x] **Task 1: Extract `splitOverlongParagraph()` helper in `useDOMPagination.ts`**
  - File: `apps/reader/src/features/reader/useDOMPagination.ts`
  - Action: Add a new function `splitOverlongParagraph(measureEl: HTMLDivElement, text: string): string[]` above `measurePages()`.
  - Algorithm:
    1. Split `text` into `words = text.split(/\s+/)`
    2. Create a `<p>` element with matching styles (marginBottom, overflowWrap, wordBreak) — same styles as `measurePages()` uses
    3. Clear `measureEl.innerHTML`, append the `<p>`
    4. Iterate words: set `p.textContent` to accumulated words joined by space
    5. After each word, check `measureEl.scrollHeight > measureEl.clientHeight`
    6. When overflow detected: the words before the current word form one chunk. Start a new chunk with the current word.
    7. If a single word overflows (edge case: extremely long word), place it alone as a chunk (prevent infinite loop)
    8. Continue until all words consumed
    9. Return array of chunk strings (each fits one page)
    10. Clean up: `measureEl.innerHTML = ''`
  - Notes: The function must handle the loop for 3+ page paragraphs naturally (keep splitting remainder). Must apply identical styles to the `<p>` element as `measurePages()` does (marginBottom: '1rem', overflowWrap: 'anywhere', wordBreak: 'break-word').

- [x] **Task 2: Integrate `splitOverlongParagraph()` into `measurePages()` in `useDOMPagination.ts`**
  - File: `apps/reader/src/features/reader/useDOMPagination.ts`
  - Action: Replace the "paragraph taller than a full page" branch (lines 66-71) to call `splitOverlongParagraph()` and push each chunk as its own page.
  - Current code (lines 65-71):
    ```typescript
    if (currentPage.length === 0) {
      // Paragraph taller than a full page — place alone on its own page
      boundaries.push(i)
      pages.push([para])
      measureEl.innerHTML = ''
      currentBoundaryIdx = i + 1
    }
    ```
  - New code:
    ```typescript
    if (currentPage.length === 0) {
      // Paragraph taller than a full page — split into chunks
      const chunks = splitOverlongParagraph(measureEl, para)
      for (const chunk of chunks) {
        boundaries.push(i)  // all chunks share same boundary index
        pages.push([chunk])
      }
      measureEl.innerHTML = ''
      currentBoundaryIdx = i + 1
    }
    ```
  - Notes: Each chunk gets the same boundary index `i` (the original paragraph index). The last chunk could potentially share a page with the next paragraph, but for simplicity we give each chunk its own page — this avoids complex re-measurement and is acceptable since overlong paragraphs are already near-full-page content.

- [x] **Task 3: Handle the "current page full, next paragraph overflows" case in `measurePages()`**
  - File: `apps/reader/src/features/reader/useDOMPagination.ts`
  - Action: In the `else` branch (lines 72-84), after flushing the current page and starting fresh with the new paragraph, check if the new paragraph alone still overflows. If so, split it.
  - Current code (lines 72-84):
    ```typescript
    } else {
      flushPage(currentBoundaryIdx)
      currentBoundaryIdx = i
      currentPage = [para]
      const el2 = document.createElement('p')
      el2.textContent = para
      el2.style.marginBottom = '1rem'
      el2.style.overflowWrap = 'anywhere'
      el2.style.wordBreak = 'break-word'
      measureEl.appendChild(el2)
    }
    ```
  - New code:
    ```typescript
    } else {
      flushPage(currentBoundaryIdx)
      currentBoundaryIdx = i
      // Re-measure the paragraph alone on fresh page
      const el2 = document.createElement('p')
      el2.textContent = para
      el2.style.marginBottom = '1rem'
      el2.style.overflowWrap = 'anywhere'
      el2.style.wordBreak = 'break-word'
      measureEl.appendChild(el2)
      if (measureEl.scrollHeight > measureEl.clientHeight) {
        // Still overflows alone — split it
        const chunks = splitOverlongParagraph(measureEl, para)
        for (const chunk of chunks) {
          boundaries.push(i)
          pages.push([chunk])
        }
        measureEl.innerHTML = ''
        currentPage = []
        currentBoundaryIdx = i + 1
      } else {
        currentPage = [para]
      }
    }
    ```

- [x] **Task 4: Fix fallback `paginateBook()` to estimate and split overlong paragraphs**
  - File: `apps/reader/src/lib/pagination/paginateBook.ts`
  - Action: Replace the fixed `paraLines = 1` with an actual line-count estimate, and split paragraphs that exceed `maxLinesPerPage`.
  - Changes:
    1. Compute `availableWidth` from optional `viewportWidth`, `contentMaxWidth`, `horizontalPadding` (default to 320 if not provided — smallest reasonable mobile width)
    2. Compute `charsPerLine = Math.max(1, Math.floor(availableWidth / (fontSize * 0.6)))` (0.6 = average character width ratio for serif fonts)
    3. Replace `const paraLines = 1` with `const paraLines = Math.max(1, Math.ceil(para.length / charsPerLine))`
    4. Add splitting logic: if `paraLines > maxLinesPerPage`, split the paragraph by words into chunks of approximately `maxLinesPerPage * charsPerLine` characters each
    5. Each chunk pushed as a separate page entry with the same boundary index `i`
  - Add helper function `splitParagraphByLines(text: string, charsPerLine: number, maxLines: number): string[]`:
    1. Split text into words
    2. Accumulate words until estimated line count reaches `maxLines`
    3. Start new chunk, repeat until done
    4. Return array of chunk strings

- [x] **Task 5: Add overlong paragraph tests to `paginateBook.test.ts`**
  - File: `apps/reader/src/lib/pagination/paginateBook.test.ts`
  - Action: Update existing "overlong single paragraph" test and add new test cases.
  - New test suite `paginateBook — overlong paragraph splitting`:
    1. **"splits a paragraph that exceeds page height into multiple pages"**: Create a paragraph with 2000+ characters, use options with small viewport. Assert `pages.length > 1`. Assert `pages.flat().join(' ')` contains all words from original.
    2. **"preserves all text content when splitting (zero loss)"**: Create overlong paragraph, paginate, join all page content. Assert every word from original appears in result.
    3. **"split sub-pages share the same boundary index"**: Assert all entries in `boundaries` for split pages have the same value.
    4. **"handles paragraph spanning 3+ pages"**: Create very long paragraph (5000+ chars), small viewport. Assert `pages.length >= 3`.
    5. **"mixed normal and overlong paragraphs"**: Array of [short, overlong, short]. Assert total content preserved and pages > 3.
  - Update existing test: Change "places single paragraph on its own page without crashing" — with the fix, a tiny viewport should now split the paragraph, so assert `pages.length >= 1` and content preserved.

- [x] **Task 6: Add overlong paragraph integration test to `ReaderEngine.test.tsx`**
  - File: `apps/reader/src/features/reader/ReaderEngine.test.tsx`
  - Action: Add a test case that mocks a paragraph triggering the overlong split path.
  - Approach: Mock `scrollHeight` to return a value > `clientHeight` for the first measurement (simulating overlong paragraph), then return fitting values for subsequent measurements. Verify the paragraph content appears across multiple rendered pages.
  - Notes: This tests the integration between `measurePages()` splitting and `ReaderEngine` rendering. The existing mock pattern in the test file (`scrollHeight = 100, clientHeight = 90`) can be extended.

- [x] **Task 7: Add e2e test for overlong paragraph pagination in `reader-layout.spec.ts`**
  - File: `apps/reader/e2e/reader-layout.spec.ts`
  - Action: Add a new test within the existing `Reader layout overflow` describe block that verifies overlong paragraphs are fully visible across multiple pages.
  - Follow existing patterns: route-mock `index.json` + book JSON, use `VERY_LONG_PARAGRAPH` (already defined as `'Namo Amitabha '.repeat(900).trim()` — ~12,600 chars).
  - Test steps:
    1. Set mobile viewport `{ width: 375, height: 667 }` to reproduce the original bug scenario
    2. Route-mock a book with a single chapter containing one `<p>${VERY_LONG_PARAGRAPH}</p>`
    3. Navigate to `/read/{bookId}`, wait for `reader-engine` visible
    4. Wait for pagination to complete: `data-page-total` > 0
    5. **Assert page count > 1**: A 12,600-char paragraph on 375x667 must produce multiple pages
    6. **Assert no content overflow on first page**: `reader-text-column` scrollHeight <= clientHeight + 1
    7. **Navigate through ALL pages** (tap right zone or ArrowRight), collecting text content from each page
    8. **Assert zero content loss**: Join all collected page text, verify it contains the full `VERY_LONG_PARAGRAPH` text (every word present)
    9. **Assert no overflow on any page**: Check scrollHeight <= clientHeight + 1 on each page during navigation
  - Notes: The right tap zone is 80-100% of viewport width (existing pattern in `ReaderEngine.test.tsx`). Use `page.getByTestId('reader-text-column').textContent()` to collect page text. The `data-page-total` attribute is already exposed by `ReaderEngine`.

### Acceptance Criteria

- [ ] **AC 1**: Given a paragraph whose rendered height exceeds the viewport height, when the reader paginates the book, then the paragraph is split across multiple pages and all text is visible (no content clipped by `overflow-hidden`).

- [ ] **AC 2**: Given a paragraph that spans 3+ pages (e.g., 5000+ characters on a 375x667 viewport), when the reader paginates, then the paragraph is split into the correct number of pages and every word appears on exactly one page.

- [ ] **AC 3**: Given a mix of short and overlong paragraphs, when the reader paginates, then short paragraphs are grouped normally and overlong paragraphs are split, with zero content loss across all pages. Invariant: `pages.flat().join(' ')` contains every word from the original paragraphs.

- [ ] **AC 4**: Given an overlong paragraph is split into N sub-pages, when checking `boundaries[]`, then all N sub-pages share the same boundary index (the original paragraph's index), preserving bookmark consistency.

- [ ] **AC 5**: Given the reader is resized (e.g., orientation change), when re-pagination occurs, then overlong paragraphs are re-split correctly for the new viewport dimensions.

- [ ] **AC 6**: Given the fallback `paginateBook()` is used (JSDOM/SSR), when an overlong paragraph is encountered, then it is split using line-count estimation and no content is lost.

- [ ] **AC 7**: Given all existing 170+ tests, when running `uv run vitest` (or `npm test` in apps/reader), then all tests pass with no regressions.

- [ ] **AC 8**: Given a Playwright e2e test with a 12,600-char paragraph on a 375x667 mobile viewport, when navigating through all pages and collecting text content, then: (a) page count > 1, (b) no page has vertical overflow > 1px, and (c) all words from the original paragraph appear in the collected text (zero content loss verified end-to-end in a real browser).

## Additional Context

### Dependencies

None — self-contained fix in pagination measurement logic. No new libraries needed.

### Testing Strategy

**Unit tests** (`paginateBook.test.ts`):
- Overlong paragraph split into multiple pages
- Content preservation: `flat().join(' ')` contains all original words
- Boundary index consistency for split sub-pages
- 3+ page paragraph splitting
- Mixed normal + overlong paragraphs

**Integration tests** (`ReaderEngine.test.tsx`):
- Mocked DOM where one paragraph's scrollHeight exceeds clientHeight
- Verify split content appears across pages

**E2e tests** (`e2e/reader-layout.spec.ts`):
- Overlong paragraph on 375x667 mobile viewport produces multiple pages
- Navigate all pages, collect text — verify zero content loss in real browser
- No vertical overflow on any page during navigation

**Manual testing**:
1. Open a book with known long paragraphs on 375x667 mobile viewport
2. Navigate through all pages — verify no text is cut off
3. Verify page count increased appropriately
4. Test landscape/portrait rotation triggers correct re-split
5. Verify bookmarks still work after the fix

### Notes

- After fix, books with long paragraphs will have more pages than before. Stored bookmark page numbers may point to slightly different content. This is acceptable — bookmarks are soft pointers and the user experience improves overall.
- The word-by-word DOM measurement in `splitOverlongParagraph()` is O(n) where n = word count. For typical overlong paragraphs (500-2000 words), this adds negligible overhead to the existing per-paragraph measurement loop.
- The `paginateBook.ts` line-count estimation is inherently approximate (no DOM), but ensures the fallback path also avoids content loss. The 0.6 average char width ratio is a reasonable heuristic for Lora serif.
- Single words that overflow a page (extreme edge case with very large font or very narrow viewport) are placed alone on one page — this prevents infinite loops while being an acceptable visual trade-off.
