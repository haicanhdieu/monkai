import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLibrarySearch } from '@/features/library/useLibrarySearch'
import type { CatalogBook } from '@/shared/types/global.types'

vi.useFakeTimers()

function makeBook(overrides: Partial<CatalogBook> & Pick<CatalogBook, 'id' | 'title' | 'translator'>): CatalogBook {
  return {
    category: 'Văn Học',
    categorySlug: 'van-hoc',
    subcategory: 'General',
    coverImageUrl: null,
    artifacts: [],
    source: 'vnthuquan',
    ...overrides,
  }
}

const vnthuquanBook = makeBook({
  id: 'truyen-kieu',
  title: 'Truyện Kiều',
  translator: 'Nguyễn Du',
})

const onedriveBook = makeBook({
  id: 'onedrive-book-1',
  title: 'Sách Nhật Tụng',
  translator: 'Thích Nhất Hạnh',
  epubUrl: 'https://tunnel.example.com/book-data/onedrive/sach/sach.epub',
  source: 'onedrive',
})

const books = [vnthuquanBook, onedriveBook]

function search(query: string) {
  const { result } = renderHook(() => useLibrarySearch(books))
  act(() => {
    result.current.setQuery(query)
  })
  act(() => {
    vi.advanceTimersByTime(300)
  })
  return result.current.results
}

beforeEach(() => {
  vi.clearAllTimers()
})

describe('useLibrarySearch – author search (Story 2.4)', () => {
  it('finds a book by translator/author field', () => {
    const results = search('Nguyen Du')
    const ids = results.map((r) => r.id)
    expect(ids).toContain('truyen-kieu')
  })

  it('finds an onedrive book by author', () => {
    const results = search('Nhat Hanh')
    const ids = results.map((r) => r.id)
    expect(ids).toContain('onedrive-book-1')
  })

  it('finds an onedrive book by title', () => {
    const results = search('Nhat Tung')
    const ids = results.map((r) => r.id)
    expect(ids).toContain('onedrive-book-1')
  })

  it('diacritic-insensitive author search works', () => {
    const results = search('Nguyễn Du')
    const ids = results.map((r) => r.id)
    expect(ids).toContain('truyen-kieu')
  })

  it('author-only query does not return books where author does not match', () => {
    const results = search('Nguyen Du')
    const ids = results.map((r) => r.id)
    expect(ids).not.toContain('onedrive-book-1')
  })

  it('SOURCES has exactly 2 entries (two-category invariant guard)', async () => {
    const { SOURCES } = await import('@/shared/constants/sources')
    expect(SOURCES).toHaveLength(2)
    const ids = SOURCES.map((s) => s.id)
    expect(ids).toContain('vbeta')
    expect(ids).toContain('vnthuquan')
    expect(ids).not.toContain('onedrive')
  })
})

describe('useLibrarySearch – initialQuery restore', () => {
  it('reflects initialQuery in query and normalizedQuery immediately', () => {
    const { result } = renderHook(() => useLibrarySearch(books, 'Truyen Kieu'))
    expect(result.current.query).toBe('Truyen Kieu')
    expect(result.current.normalizedQuery).toBe('truyen kieu')
  })

  it('returns results immediately without advancing timers', () => {
    const { result } = renderHook(() => useLibrarySearch(books, 'Nguyen Du'))
    // No act/advanceTimersByTime needed — debouncedQuery initialized from initialQuery
    expect(result.current.results.map((r) => r.id)).toContain('truyen-kieu')
  })

  it('empty initialQuery produces empty results', () => {
    const { result } = renderHook(() => useLibrarySearch(books, ''))
    expect(result.current.query).toBe('')
    expect(result.current.results).toHaveLength(0)
  })
})
