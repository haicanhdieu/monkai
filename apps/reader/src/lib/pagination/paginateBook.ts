import type { PaginationOptions } from './pagination.types'

/**
 * Returns the pixel height occupied by a single paragraph.
 *
 * Each paragraph is treated as one wrapped-text block occupying one line.
 * The height is `fontSize * lineHeight`.
 */
function paragraphHeightPx(fontSize: number, lineHeight: number): number {
  return fontSize * lineHeight
}

/**
 * Splits an array of paragraphs into viewport-sized pages.
 *
 * Rules:
 * - Paragraphs are never split across page boundaries.
 * - Available page height = `viewportHeight - 2 * paddingVertical`.
 * - Page capacity is pre-computed as `Math.floor(availableHeight / paragraphHeight)` (integer).
 *   This avoids floating-point accumulation drift over large books.
 * - A paragraph that alone exceeds the available height occupies its own page
 *   (capacity is clamped to at least 1 — prevents infinite loops, AC 5).
 * - An empty input returns one empty page — `[[]]` (AC 4).
 *
 * Complexity: O(n) in paragraph count.
 *
 * @param paragraphs - Ordered paragraph text array.
 * @param options    - Viewport and font metrics controlling page capacity.
 * @returns          - Array of pages; each page is an array of paragraph strings.
 */
export function paginateBook(paragraphs: string[], options: PaginationOptions): string[][] {
  const { viewportHeight, paddingVertical } = options
  // Clamp font metrics to positive values to guard against divide-by-zero
  const fontSize = Math.max(1, options.fontSize)
  const lineHeight = Math.max(0.1, options.lineHeight)

  if (paragraphs.length === 0) {
    return [[]]
  }

  const availableHeight = viewportHeight - 2 * paddingVertical
  const pHeight = paragraphHeightPx(fontSize, lineHeight)
  // Use integer capacity to avoid floating-point accumulation over large page counts.
  // Clamp to at least 1 so an overlong single paragraph always gets its own page (AC 5).
  const pageCapacity = Math.max(1, Math.floor(availableHeight / pHeight))

  const pages: string[][] = []
  let currentPage: string[] = []

  for (const paragraph of paragraphs) {
    if (currentPage.length >= pageCapacity) {
      pages.push(currentPage)
      currentPage = [paragraph]
    } else {
      currentPage.push(paragraph)
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage)
  }

  return pages
}
