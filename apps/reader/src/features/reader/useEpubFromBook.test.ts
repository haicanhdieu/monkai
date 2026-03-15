import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import { useEpubFromBook } from './useEpubFromBook'
import type { Book } from '@/shared/types/global.types'

vi.mock('@/shared/lib/bookToEpub', () => ({
  bookToEpubBuffer: vi.fn(),
}))

vi.mock('@/shared/services/storage.service', () => ({
  storageService: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}))

const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
const mockRevokeObjectURL = vi.fn()

vi.stubGlobal('URL', {
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
})

const bookFixture: Book = {
  id: 'test-book',
  title: 'Test Book',
  category: 'Đại Thừa',
  subcategory: 'Test',
  translator: 'Tester',
  coverImageUrl: null,
  content: ['Paragraph one'],
}

describe('useEpubFromBook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns isLoading: false and epubUrl: null when book is null', async () => {
    const { result } = renderHook(() => useEpubFromBook(null))

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current).toEqual({
      epubUrl: null,
      isLoading: false,
      error: null,
    })
  })

  it('returns isLoading: true immediately when called with non-null book (no parse-error flash)', () => {
    const { result } = renderHook(() => useEpubFromBook(bookFixture))
    // Synchronous check: before any effect/await, derived loading must be true when book is set but epubUrl not yet ready
    expect(result.current.isLoading).toBe(true)
    expect(result.current.epubUrl).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns isLoading: true while EPUB is being prepared', async () => {
    const { bookToEpubBuffer } = await import('@/shared/lib/bookToEpub')
    const { storageService } = await import('@/shared/services/storage.service')

    ;(storageService.getItem as Mock).mockResolvedValue(null)
    ;(bookToEpubBuffer as Mock).mockReturnValue(
      new Promise<ArrayBuffer>(() => {
        // never resolve to simulate in-flight generation
      }),
    )

    const { result } = renderHook(() => useEpubFromBook(bookFixture))

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.epubUrl).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('sets epubUrl to blob URL after bookToEpubBuffer resolves', async () => {
    const { bookToEpubBuffer } = await import('@/shared/lib/bookToEpub')
    const { storageService } = await import('@/shared/services/storage.service')

    ;(storageService.getItem as Mock).mockResolvedValue(null)
    ;(bookToEpubBuffer as Mock).mockResolvedValue(new ArrayBuffer(8))

    const { result } = renderHook(() => useEpubFromBook(bookFixture))

    await act(async () => {
      await Promise.resolve()
    })

    expect(bookToEpubBuffer).toHaveBeenCalled()
    expect(mockCreateObjectURL).toHaveBeenCalled()
    expect(result.current.epubUrl).toBe('blob:mock-url')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error when bookToEpubBuffer rejects', async () => {
    const { bookToEpubBuffer } = await import('@/shared/lib/bookToEpub')
    const { storageService } = await import('@/shared/services/storage.service')

    ;(storageService.getItem as Mock).mockResolvedValue(null)
    ;(bookToEpubBuffer as Mock).mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useEpubFromBook(bookFixture))

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('fail')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.epubUrl).toBeNull()
  })

  it('uses cached Blob and skips bookToEpubBuffer', async () => {
    const { bookToEpubBuffer } = await import('@/shared/lib/bookToEpub')
    const { storageService } = await import('@/shared/services/storage.service')

    const cachedBlob = new Blob([new ArrayBuffer(8)], { type: 'application/epub+zip' })
    ;(storageService.getItem as Mock).mockResolvedValue(cachedBlob)

    const { result, unmount } = renderHook(() => useEpubFromBook(bookFixture))

    await act(async () => {
      await Promise.resolve()
    })

    expect(bookToEpubBuffer).not.toHaveBeenCalled()
    expect(storageService.getItem).toHaveBeenCalledWith(expect.stringMatching(/^epub_blob_v3_/))
    expect(result.current.epubUrl).toBe('blob:mock-url')

    unmount()
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})

