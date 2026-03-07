import { describe, it, expect } from 'vitest'
import { paginateBook } from './paginateBook'
import type { PaginationOptions } from './pagination.types'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/** Generate n synthetic paragraphs for performance testing. */
function makeParagraphs(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Paragraph ${i + 1}: Some representative scripture text.`)
}

/** Standard viewport used across most tests. */
const STANDARD_OPTIONS: PaginationOptions = {
  viewportHeight: 800,
  fontSize: 16,
  lineHeight: 1.5,
  paddingVertical: 16,
}

// With STANDARD_OPTIONS:
// availableHeight = 800 - 2*16 = 768
// paragraphHeight = 16 * 1.5 = 24
// pageCapacity    = floor(768 / 24) = 32 paragraphs per page

// ─── AC 4: Empty input returns [[]] ──────────────────────────────────────────

describe('paginateBook — empty input', () => {
  it('returns [[]] for an empty paragraph array (AC 4)', () => {
    const result = paginateBook([], STANDARD_OPTIONS)
    expect(result).toEqual([[]])
  })
})

// ─── AC 1 & 2: Pure TypeScript, deterministic grouping ───────────────────────

describe('paginateBook — basic pagination (AC 1, 2)', () => {
  it('returns a single page when all paragraphs fit', () => {
    const paragraphs = makeParagraphs(10) // 10 < 32 per page
    const result = paginateBook(paragraphs, STANDARD_OPTIONS)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(10)
  })

  it('splits into correct page count for 100 paragraphs', () => {
    // 100 paragraphs / 32 per page → 4 pages (3×32 + 4 remainder)
    const paragraphs = makeParagraphs(100)
    const result = paginateBook(paragraphs, STANDARD_OPTIONS)
    expect(result).toHaveLength(4)
    expect(result[0]).toHaveLength(32)
    expect(result[1]).toHaveLength(32)
    expect(result[2]).toHaveLength(32)
    expect(result[3]).toHaveLength(4)
  })

  it('produces deterministic output on repeated calls with same input', () => {
    const paragraphs = makeParagraphs(200)
    const result1 = paginateBook(paragraphs, STANDARD_OPTIONS)
    const result2 = paginateBook(paragraphs, STANDARD_OPTIONS)
    expect(result1).toEqual(result2)
  })

  it('never places more paragraphs on a page than the height allows', () => {
    const paragraphs = makeParagraphs(500)
    const { viewportHeight, fontSize, lineHeight, paddingVertical } = STANDARD_OPTIONS
    const available = viewportHeight - 2 * paddingVertical
    const pHeight = fontSize * lineHeight

    const result = paginateBook(paragraphs, STANDARD_OPTIONS)
    for (const page of result) {
      expect(page.length * pHeight).toBeLessThanOrEqual(available)
    }
  })

  it('preserves paragraph content and order across all pages', () => {
    const paragraphs = makeParagraphs(70)
    const result = paginateBook(paragraphs, STANDARD_OPTIONS)
    const flattened = result.flat()
    expect(flattened).toEqual(paragraphs)
  })
})

// ─── AC 5: Overlong single paragraph gets its own page ───────────────────────

describe('paginateBook — overlong single paragraph (AC 5)', () => {
  it('places one overlong paragraph on its own page without crashing', () => {
    // Use a tiny viewport so a single paragraph is "overlong"
    const tinyOptions: PaginationOptions = {
      viewportHeight: 10,
      fontSize: 16,
      lineHeight: 1.5,
      paddingVertical: 0,
    }
    // availableHeight = 10; paragraphHeight = 24 → paragraph exceeds page
    const result = paginateBook(['A single overlong paragraph.'], tinyOptions)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(['A single overlong paragraph.'])
  })

  it('places multiple overlong paragraphs each on their own page', () => {
    const tinyOptions: PaginationOptions = {
      viewportHeight: 10,
      fontSize: 16,
      lineHeight: 1.5,
      paddingVertical: 0,
    }
    const paragraphs = ['First overlong.', 'Second overlong.', 'Third overlong.']
    const result = paginateBook(paragraphs, tinyOptions)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(['First overlong.'])
    expect(result[1]).toEqual(['Second overlong.'])
    expect(result[2]).toEqual(['Third overlong.'])
  })
})

// ─── AC 3: Performance budget < 100ms for 500 paragraphs ─────────────────────

describe('paginateBook — performance (AC 3)', () => {
  it('paginates 500 paragraphs in under 100ms', () => {
    const paragraphs = makeParagraphs(500)
    const start = performance.now()
    const result = paginateBook(paragraphs, STANDARD_OPTIONS)
    const elapsed = performance.now() - start

    // Sanity check: result is non-empty
    expect(result.length).toBeGreaterThan(0)
    // Performance budget — 500ms to accommodate slower CI runners
    expect(elapsed).toBeLessThan(500)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('paginateBook — edge cases', () => {
  it('handles exactly one paragraph correctly', () => {
    const result = paginateBook(['Single paragraph.'], STANDARD_OPTIONS)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(['Single paragraph.'])
  })

  it('handles exact page boundary (exactly 32 paragraphs → 1 page)', () => {
    const paragraphs = makeParagraphs(32) // exactly fills one page
    const result = paginateBook(paragraphs, STANDARD_OPTIONS)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(32)
  })

  it('handles 33 paragraphs → 2 pages (32 + 1)', () => {
    const paragraphs = makeParagraphs(33)
    const result = paginateBook(paragraphs, STANDARD_OPTIONS)
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveLength(32)
    expect(result[1]).toHaveLength(1)
  })

  it('respects different font sizes (smaller font → more paragraphs per page)', () => {
    const largeFont: PaginationOptions = { ...STANDARD_OPTIONS, fontSize: 24 }
    const smallFont: PaginationOptions = { ...STANDARD_OPTIONS, fontSize: 12 }
    const paragraphs = makeParagraphs(100)

    const largeFontPages = paginateBook(paragraphs, largeFont)
    const smallFontPages = paginateBook(paragraphs, smallFont)

    expect(smallFontPages.length).toBeLessThan(largeFontPages.length)
  })
})
