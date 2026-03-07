import type { PaginationOptions } from './pagination.types'
import type { PageBoundaries } from './pagination.types'

/**
 * JSDOM-safe fallback pagination utility.
 *
 * Uses line-count estimation (no DOM access). Suitable for unit tests and
 * SSR environments where `scrollHeight`/`clientHeight` are unavailable.
 *
 * For browser environments, use `useDOMPagination` hook instead, which
 * measures actual rendered heights via a hidden DOM element.
 *
 * Rules:
 * - Available page height = `viewportHeight - 2 * paddingVertical`.
 * - Returns `PageBoundaries` with `pages` (content per page) and
 *   `boundaries` (paragraph index of first paragraph on each page).
 * - Empty input returns `{ pages: [[]], boundaries: [0] }`.
 */
export function paginateBook(paragraphs: string[], options: PaginationOptions): PageBoundaries {
  const fontSize = Math.max(1, options.fontSize)
  const lineHeight = Math.max(0.1, options.lineHeight)
  const availableHeight = Math.max(1, options.viewportHeight - 2 * options.paddingVertical)
  const linePx = fontSize * lineHeight
  const maxLinesPerPage = Math.max(1, Math.floor(availableHeight / linePx))

  const normalizedParagraphs = paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  if (normalizedParagraphs.length === 0) {
    return { pages: [[]], boundaries: [0] }
  }

  const pages: string[][] = []
  const boundaries: number[] = []
  let currentPage: string[] = []
  let currentLines = 0
  let currentBoundaryIdx = 0

  for (let i = 0; i < normalizedParagraphs.length; i++) {
    const para = normalizedParagraphs[i]
    // Each paragraph occupies at least 1 line
    const paraLines = 1

    if (currentPage.length > 0 && currentLines + paraLines > maxLinesPerPage) {
      boundaries.push(currentBoundaryIdx)
      pages.push(currentPage)
      currentPage = []
      currentLines = 0
      currentBoundaryIdx = i
    }

    currentPage.push(para)
    currentLines += paraLines
  }

  if (currentPage.length > 0) {
    boundaries.push(currentBoundaryIdx)
    pages.push(currentPage)
  }

  return { pages, boundaries }
}
