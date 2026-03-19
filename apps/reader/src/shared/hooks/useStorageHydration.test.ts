import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStorageHydration } from '@/shared/hooks/useStorageHydration'
import { useReaderStore } from '@/stores/reader.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useBookmarksStore } from '@/stores/bookmarks.store'

vi.mock('@/shared/services/storage.service', () => ({
  storageService: {
    getItem: vi.fn(),
  },
}))

import { storageService } from '@/shared/services/storage.service'

const mockStorageService = storageService as unknown as { getItem: ReturnType<typeof vi.fn> }

beforeEach(() => {
  useReaderStore.setState({ currentCfi: null })
  useSettingsStore.setState({ fontSize: 18, theme: 'sepia' })
  useBookmarksStore.setState({ bookmarks: [] })
  vi.clearAllMocks()
})

const UUID_BOOK_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const SEO_SLUG_BOOK_ID = 'vbeta__bo-trung-quan'
const SAMPLE_CFI = 'epubcfi(/6/4[chap01]!/4/2/1:0)'

describe('useStorageHydration', () => {
  it('hydrates reader store with CFI when persisted value uses new shape', async () => {
    const lastRead = { bookId: UUID_BOOK_ID, cfi: SAMPLE_CFI }
    const settings = { fontSize: 20, theme: 'dark' as const }
    const bookmarks = [
      { bookId: UUID_BOOK_ID, bookTitle: 'Kinh Pháp Hoa', cfi: SAMPLE_CFI, timestamp: 1000 },
    ]

    mockStorageService.getItem
      .mockResolvedValueOnce(lastRead)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(bookmarks)

    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(useReaderStore.getState().currentCfi).toBe(SAMPLE_CFI)
      expect(useSettingsStore.getState().fontSize).toBe(20)
      expect(useSettingsStore.getState().theme).toBe('dark')
      expect(useBookmarksStore.getState().bookmarks).toHaveLength(1)
    })
    unmount()
  })

  it('does not hydrate reader store when storage returns null', async () => {
    mockStorageService.getItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const setCurrentCfiSpy = vi.spyOn(useReaderStore.getState(), 'setCurrentCfi')
    const hydrateSettingsSpy = vi.spyOn(useSettingsStore.getState(), 'hydrate')
    const hydrateBookmarksSpy = vi.spyOn(useBookmarksStore.getState(), 'hydrate')

    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(mockStorageService.getItem).toHaveBeenCalledTimes(3)
    })

    expect(setCurrentCfiSpy).not.toHaveBeenCalled()
    expect(hydrateSettingsSpy).not.toHaveBeenCalled()
    expect(hydrateBookmarksSpy).not.toHaveBeenCalled()
    unmount()
  })

  it('ignores LAST_READ_POSITION with old page-based shape (no cfi field)', async () => {
    // Old shape: { bookId, page } — no cfi field
    const lastRead = { bookId: UUID_BOOK_ID, page: 14 }
    mockStorageService.getItem
      .mockResolvedValueOnce(lastRead)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(mockStorageService.getItem).toHaveBeenCalledTimes(3)
    })
    expect(useReaderStore.getState().currentCfi).toBeNull()
    unmount()
  })

  it('discards LAST_READ_POSITION with a legacy SEO-slug bookId', async () => {
    const lastRead = { bookId: SEO_SLUG_BOOK_ID, cfi: SAMPLE_CFI }
    mockStorageService.getItem
      .mockResolvedValueOnce(lastRead)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(mockStorageService.getItem).toHaveBeenCalledTimes(3)
    })
    expect(useReaderStore.getState().currentCfi).toBeNull()
    unmount()
  })

  it('filters out legacy SEO-slug bookmarks and keeps valid UUID bookmarks', async () => {
    const bookmarks = [
      { bookId: SEO_SLUG_BOOK_ID, bookTitle: 'Stale', cfi: 'epubcfi(/6/2!/4/2/1:0)', timestamp: 1000 },
      { bookId: UUID_BOOK_ID, bookTitle: 'Valid', cfi: SAMPLE_CFI, timestamp: 2000 },
    ]
    mockStorageService.getItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(bookmarks)

    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(useBookmarksStore.getState().bookmarks).toHaveLength(1)
      expect(useBookmarksStore.getState().bookmarks[0].bookId).toBe(UUID_BOOK_ID)
    })
    unmount()
  })

  it('defaults type to "auto" for legacy bookmarks without a type field', async () => {
    const bookmarks = [
      { bookId: UUID_BOOK_ID, bookTitle: 'Legacy', cfi: SAMPLE_CFI, timestamp: 1000 }
    ]
    mockStorageService.getItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(bookmarks)
    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(useBookmarksStore.getState().bookmarks[0].type).toBe('auto')
    })
    unmount()
  })

  it('does not hydrate bookmarks store when all persisted bookmarks are legacy SEO slugs', async () => {
    const bookmarks = [
      { bookId: SEO_SLUG_BOOK_ID, bookTitle: 'Stale', cfi: 'epubcfi(/6/2!/4/2/1:0)', timestamp: 1000 },
    ]
    mockStorageService.getItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(bookmarks)

    const hydrateBookmarksSpy = vi.spyOn(useBookmarksStore.getState(), 'hydrate')

    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(mockStorageService.getItem).toHaveBeenCalledTimes(3)
    })
    expect(hydrateBookmarksSpy).not.toHaveBeenCalled()
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(0)
    unmount()
  })
})
