import type { PaginationOptions } from './pagination.types'
import type { PageBoundaries } from './pagination.types'

/**
 * Split a paragraph into chunks that each fit within `maxLines` lines,
 * where each line holds approximately `charsPerLine` characters.
 */
function splitParagraphByLines(text: string, charsPerLine: number, maxLines: number): string[] {
  const maxCharsPerChunk = charsPerLine * maxLines
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return [text]

  const chunks: string[] = []
  let currentChunk = ''

  for (const word of words) {
    const candidate = currentChunk ? currentChunk + ' ' + word : word
    if (currentChunk && candidate.length > maxCharsPerChunk) {
      chunks.push(currentChunk)
      currentChunk = word
    } else {
      currentChunk = candidate
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks
}

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

  // Estimate characters per line from available width
  const availableWidth = Math.min(
    options.contentMaxWidth ?? Infinity,
    (options.viewportWidth ?? 320) - 2 * (options.horizontalPadding ?? 0),
  )
  const charsPerLine = Math.max(1, Math.floor(Math.max(1, availableWidth) / (fontSize * 0.6)))

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
    const paraLines = Math.max(1, Math.ceil(para.length / charsPerLine))

    if (paraLines > maxLinesPerPage) {
      // Flush current page if it has content
      if (currentPage.length > 0) {
        boundaries.push(currentBoundaryIdx)
        pages.push(currentPage)
        currentPage = []
        currentLines = 0
      }

      // Split the overlong paragraph into chunks
      const chunks = splitParagraphByLines(para, charsPerLine, maxLinesPerPage)
      for (const chunk of chunks) {
        boundaries.push(i)
        pages.push([chunk])
      }
      currentBoundaryIdx = i + 1
      continue
    }

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
