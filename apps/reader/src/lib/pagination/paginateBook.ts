import type { PaginationOptions } from './pagination.types'

const DEFAULT_CONTENT_MAX_WIDTH = 700
const DEFAULT_HORIZONTAL_PADDING = 48
const AVG_CHAR_WIDTH_EM = 0.6

function lineHeightPx(fontSize: number, lineHeight: number): number {
  return fontSize * lineHeight
}

function resolveCharsPerLine(options: PaginationOptions): number {
  const contentMaxWidth = options.contentMaxWidth ?? DEFAULT_CONTENT_MAX_WIDTH
  const horizontalPadding = options.horizontalPadding ?? DEFAULT_HORIZONTAL_PADDING
  const viewportWidth = options.viewportWidth ?? contentMaxWidth + horizontalPadding

  const usableWidth = Math.max(120, Math.min(contentMaxWidth, viewportWidth - horizontalPadding))
  const charWidthPx = Math.max(1, options.fontSize * AVG_CHAR_WIDTH_EM)

  return Math.max(12, Math.floor(usableWidth / charWidthPx))
}

function estimateLineCount(text: string, charsPerLine: number): number {
  if (text.length === 0) {
    return 1
  }
  return Math.max(1, Math.ceil(text.length / charsPerLine))
}

function splitParagraphToFit(paragraph: string, maxCharsPerPage: number): string[] {
  const normalized = paragraph.trim()
  if (normalized.length <= maxCharsPerPage) {
    return [normalized]
  }

  const parts: string[] = []
  let remaining = normalized

  while (remaining.length > maxCharsPerPage) {
    let cut = maxCharsPerPage
    const nearestWhitespace = remaining.lastIndexOf(' ', cut)

    // Keep chunks reasonably balanced when possible; hard-cut long uninterrupted words.
    if (nearestWhitespace > Math.floor(maxCharsPerPage * 0.6)) {
      cut = nearestWhitespace
    }

    const chunk = remaining.slice(0, cut).trim()
    if (chunk.length === 0) {
      parts.push(remaining.slice(0, maxCharsPerPage))
      remaining = remaining.slice(maxCharsPerPage).trimStart()
      continue
    }

    parts.push(chunk)
    remaining = remaining.slice(cut).trimStart()
  }

  if (remaining.length > 0) {
    parts.push(remaining)
  }

  return parts
}

/**
 * Splits an array of paragraphs into viewport-sized pages.
 *
 * Rules:
 * - Available page height = `viewportHeight - 2 * paddingVertical`.
 * - Paragraphs may be split into smaller chunks if estimated wrapped height
 *   exceeds a page.
 * - Empty input returns `[[]]`.
 */
export function paginateBook(paragraphs: string[], options: PaginationOptions): string[][] {
  const fontSize = Math.max(1, options.fontSize)
  const lineHeight = Math.max(0.1, options.lineHeight)
  const availableHeight = Math.max(1, options.viewportHeight - 2 * options.paddingVertical)
  const linePx = lineHeightPx(fontSize, lineHeight)
  const maxLinesPerPage = Math.max(1, Math.floor(availableHeight / linePx))
  const charsPerLine = resolveCharsPerLine({ ...options, fontSize })
  const maxCharsPerPage = Math.max(1, maxLinesPerPage * charsPerLine)

  if (paragraphs.length === 0) {
    return [[]]
  }

  const normalizedParagraphs = paragraphs
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)

  if (normalizedParagraphs.length === 0) {
    return [[]]
  }

  const pages: string[][] = []
  let currentPage: string[] = []
  let currentLines = 0

  for (const paragraph of normalizedParagraphs) {
    const chunks = splitParagraphToFit(paragraph, maxCharsPerPage)

    for (const chunk of chunks) {
      const chunkLines = estimateLineCount(chunk, charsPerLine)

      if (currentPage.length > 0 && currentLines + chunkLines > maxLinesPerPage) {
        pages.push(currentPage)
        currentPage = []
        currentLines = 0
      }

      currentPage.push(chunk)
      currentLines += chunkLines
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage)
  }

  return pages
}
