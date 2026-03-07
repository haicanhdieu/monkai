import { describe, it, expect } from 'vitest'
import { paginateBook } from './paginateBook'
import type { PaginationOptions } from './pagination.types'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeParagraphs(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Paragraph ${i + 1}: Some representative scripture text.`)
}

const STANDARD_OPTIONS: PaginationOptions = {
  viewportHeight: 800,
  fontSize: 16,
  lineHeight: 1.5,
  paddingVertical: 16,
}

// ─── Empty input ──────────────────────────────────────────────────────────────

describe('paginateBook — empty input', () => {
  it('returns { pages: [[]], boundaries: [0] } for empty array', () => {
    const result = paginateBook([], STANDARD_OPTIONS)
    expect(result.pages).toEqual([[]])
    expect(result.boundaries).toEqual([0])
  })

  it('returns { pages: [[]], boundaries: [0] } for all-whitespace paragraphs', () => {
    const result = paginateBook(['  ', '\t', ''], STANDARD_OPTIONS)
    expect(result.pages).toEqual([[]])
    expect(result.boundaries).toEqual([0])
  })
})

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('paginateBook — return shape', () => {
  it('returns a PageBoundaries object with pages and boundaries arrays', () => {
    const result = paginateBook(makeParagraphs(5), STANDARD_OPTIONS)
    expect(result).toHaveProperty('pages')
    expect(result).toHaveProperty('boundaries')
    expect(Array.isArray(result.pages)).toBe(true)
    expect(Array.isArray(result.boundaries)).toBe(true)
  })

  it('pages and boundaries have the same length', () => {
    const result = paginateBook(makeParagraphs(100), STANDARD_OPTIONS)
    expect(result.pages.length).toBe(result.boundaries.length)
  })

  it('first boundary is always 0', () => {
    const result = paginateBook(makeParagraphs(10), STANDARD_OPTIONS)
    expect(result.boundaries[0]).toBe(0)
  })

  it('boundaries are monotonically increasing', () => {
    const result = paginateBook(makeParagraphs(200), STANDARD_OPTIONS)
    for (let i = 1; i < result.boundaries.length; i++) {
      expect(result.boundaries[i]).toBeGreaterThan(result.boundaries[i - 1])
    }
  })
})

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('paginateBook — determinism', () => {
  it('produces identical output on repeated calls with same input', () => {
    const paragraphs = makeParagraphs(200)
    const r1 = paginateBook(paragraphs, STANDARD_OPTIONS)
    const r2 = paginateBook(paragraphs, STANDARD_OPTIONS)
    expect(r1).toEqual(r2)
  })
})

// ─── Content preservation ─────────────────────────────────────────────────────

describe('paginateBook — content preservation', () => {
  it('preserves all paragraphs (none lost or duplicated)', () => {
    const paragraphs = makeParagraphs(70)
    const result = paginateBook(paragraphs, STANDARD_OPTIONS)
    const flattened = result.pages.flat()
    expect(flattened).toEqual(paragraphs)
  })

  it('preserves paragraph order across pages', () => {
    const paragraphs = makeParagraphs(50)
    const result = paginateBook(paragraphs, STANDARD_OPTIONS)
    const flattened = result.pages.flat()
    for (let i = 0; i < paragraphs.length; i++) {
      expect(flattened[i]).toBe(paragraphs[i])
    }
  })
})

// ─── Font size ratio ──────────────────────────────────────────────────────────

describe('paginateBook — font size effect', () => {
  it('larger font produces more pages than smaller font', () => {
    const paragraphs = makeParagraphs(100)
    const largeFont: PaginationOptions = { ...STANDARD_OPTIONS, fontSize: 24 }
    const smallFont: PaginationOptions = { ...STANDARD_OPTIONS, fontSize: 12 }
    const large = paginateBook(paragraphs, largeFont)
    const small = paginateBook(paragraphs, smallFont)
    expect(small.pages.length).toBeLessThan(large.pages.length)
  })
})

// ─── Overlong single paragraph ────────────────────────────────────────────────

describe('paginateBook — overlong single paragraph', () => {
  it('places single paragraph on its own page without crashing', () => {
    const tinyOptions: PaginationOptions = {
      viewportHeight: 10,
      fontSize: 16,
      lineHeight: 1.5,
      paddingVertical: 0,
    }
    const result = paginateBook(['A single paragraph.'], tinyOptions)
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0]).toEqual(['A single paragraph.'])
    expect(result.boundaries).toEqual([0])
  })
})

// ─── Performance ──────────────────────────────────────────────────────────────

describe('paginateBook — performance', () => {
  it('paginates 500 paragraphs in under 500ms', () => {
    const paragraphs = makeParagraphs(500)
    const start = performance.now()
    const result = paginateBook(paragraphs, STANDARD_OPTIONS)
    const elapsed = performance.now() - start
    expect(result.pages.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })
})

// ─── Single paragraph ─────────────────────────────────────────────────────────

describe('paginateBook — single paragraph', () => {
  it('handles exactly one paragraph correctly', () => {
    const result = paginateBook(['Single paragraph.'], STANDARD_OPTIONS)
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0]).toEqual(['Single paragraph.'])
    expect(result.boundaries).toEqual([0])
  })
})
