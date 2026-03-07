---
title: 'Fix Horizontal and Vertical Scrollbars in Reader'
slug: 'fix-horizontal-vertical-scrollbars-reader'
created: '2026-03-07T16:21:29+07:00'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React', 'TypeScript', 'Tailwind CSS', 'Zustand']
files_to_modify: ['apps/reader/src/features/reader/ReaderEngine.tsx', 'apps/reader/src/lib/pagination/paginateBook.ts', 'apps/reader/e2e/reader-layout.spec.ts']
code_patterns: ['Functional components', 'Tailwind utility classes']
test_patterns: ['Jest / React Testing Library', 'Playwright E2E']
---

# Tech-Spec: Fix Horizontal and Vertical Scrollbars in Reader

**Created:** 2026-03-07T16:21:29+07:00

## Overview

### Problem Statement

The reader currently suffers from layout overflow issues. Long uninterrupted strings cause a horizontal scrollbar. Additionally, long paragraphs that span multiple wrapped lines are calculated incorrectly by the pagination logic (which assumes every paragraph is exactly 1 line tall), resulting in content overflowing the page height and causing vertical scrollbars.

### Solution

Fix the reader so that it properly paginates text and fits perfectly within the viewport, preventing any native horizontal or vertical scrollbars. We will add CSS word-wrapping to prevent horizontal overflow, and we will update the `paginateBook` logic to estimate line counts for long paragraphs (or split them) so they don't overflow the vertical page capacity.

### Scope

**In Scope:**
- Investigating and updating `ReaderEngine.tsx` to handle horizontal word wrapping.
- Updating `paginateBook.ts` logic to properly account for multi-line paragraphs or split extremely long paragraphs across pages so that the vertical height is respected.
- Ensuring the text stays paginated and within the viewport properly without native scrolling.

**Out of Scope:**
- Changing the underlying book/catalog data structure.
- Major architectural changes to the app wrapper outside of the reader's layout components or pagination utility.

## Context for Development

### Codebase Patterns

- **State Management**: Zustand store (`useReaderStore`) for handling currentPage and pagination state.
- **Styling**: Tailwind CSS for layout, spacing, and typography.
- **UI Structure**: The reader uses `paginateBook` to pre-calculate page chunks, then renders the current chunk in `ReaderEngine`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/features/reader/ReaderEngine.tsx` | Main presentation component. Needs CSS `break-words` adjustments. |
| `apps/reader/src/lib/pagination/paginateBook.ts` | Pagination utility. Currently assumes `fontSize * lineHeight` per paragraph regardless of length. |

### Technical Decisions

- **Horizontal Overflow**: Enforce word-breaking on paragraph elements using `break-words` and `overflow-wrap: anywhere` in `ReaderEngine.tsx` to ensure no single word can break out of the container horizontally.
- **Vertical Overflow / Pagination**: Update `paginateBook.ts` to estimate the number of lines a paragraph will take. Since it doesn't have DOM access, it can use a heuristic (e.g., characters per line based on average character width and an assumed container max-width of ~700px). If a single paragraph is estimated to be taller than the `availableHeight`, the logic must either split the paragraph string into smaller paragraph chunks or allocate it across multiple pages to prevent vertical overflow.

## Implementation Plan

### Tasks

- [ ] Task 1: Add text wrapping CSS properties to ReaderEngine paragraphs
  - File: `apps/reader/src/features/reader/ReaderEngine.tsx`
  - Action: Update the `<p>` elements to include `wordBreak: 'break-word'` and `overflowWrap: 'anywhere'` in their style (or equivalent Tailwind classes) to guarantee strings do not overflow horizontally. Validate `overflow-hidden` is strictly applied.

- [ ] Task 2: Enhance pagination logic to handle long paragraphs
  - File: `apps/reader/src/lib/pagination/paginateBook.ts`
  - Action: Modify `paginateBook` to estimate paragraph line loops based on character count. For example, assuming an average of 60-80 characters per line in a 700px container. If a paragraph's estimated lines exceed the remaining `pageCapacity`, it should be split into smaller string chunks so that it flows across multiple pages without exceeding the viewport height.

- [ ] Task 3: Add E2E tests for reader scrollbar layout
  - File: `apps/reader/e2e/reader-layout.spec.ts`
  - Action: Create a new Playwright test that loads a mock book with long paragraphs and unbroken strings. Assert that the locator for the reader container does not have horizontal or vertical scrollbars (e.g., verifying `scrollHeight` equals `clientHeight` and `scrollWidth` equals `clientWidth`).

### Acceptance Criteria

- [ ] AC 1: Given a reader page with a paragraph containing an extremely long unbroken string, when rendered, the text wraps to the next line and does not trigger a horizontal scrollbar.
- [ ] AC 2: Given a book with exceptionally long paragraphs (e.g., 2000+ characters), when the book is paginated, the long paragraphs are split across multiple pages so they do not exceed the viewport height or trigger a vertical scrollbar.
- [ ] AC 3: Given the reader view, when navigating through pages, no horizontal or vertical native browser scrollbars appear on the reading container or window.

## Additional Context

### Dependencies

- None.

### Testing Strategy

- **Manual Testing**: Open a book containing very long contiguous strings, and extremely long paragraphs. Verify no scrollbars appear.
- **Unit Testing**: Update `ReaderEngine.test.tsx` and any `paginateBook.test.ts` to ensure edge-case paragraph lengths are handled.
- **E2E Testing**: Add Playwright tests to programmatically verify that the reader container renders without native scrollbars across different viewport sizes.
