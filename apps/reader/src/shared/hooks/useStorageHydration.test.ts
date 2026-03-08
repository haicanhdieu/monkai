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

const mockStorageService = storageService as { getItem: ReturnType<typeof vi.fn> }

beforeEach(() => {
  useReaderStore.setState({ bookId: '', bookTitle: '', currentPage: 0 })
  useSettingsStore.setState({ fontSize: 18, theme: 'sepia' })
  useBookmarksStore.setState({ bookmarks: [] })
  vi.clearAllMocks()
})

const UUID_BOOK_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const SEO_SLUG_BOOK_ID = 'vbeta__bo-trung-quan'

describe('useStorageHydration', () => {
  it('hydrates each store when persisted values use catalog UUIDs', async () => {
    const lastRead = { bookId: UUID_BOOK_ID, page: 14 }
    const settings = { fontSize: 20, theme: 'dark' as const }
    const bookmarks = [{ bookId: UUID_BOOK_ID, bookTitle: 'Kinh Pháp Hoa', page: 14, timestamp: 1000 }]

    mockStorageService.getItem
      .mockResolvedValueOnce(lastRead)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(bookmarks)

    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(useReaderStore.getState().bookId).toBe(UUID_BOOK_ID)
      expect(useReaderStore.getState().currentPage).toBe(14)
      expect(useSettingsStore.getState().fontSize).toBe(20)
      expect(useSettingsStore.getState().theme).toBe('dark')
      expect(useBookmarksStore.getState().bookmarks).toHaveLength(1)
    })
    unmount()
  })

  it('does not hydrate reader or bookmarks stores when storage returns null', async () => {
    mockStorageService.getItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const hydrateSpy = vi.spyOn(useReaderStore.getState(), 'hydrate')
    const hydrateSettingsSpy = vi.spyOn(useSettingsStore.getState(), 'hydrate')
    const hydrateBookmarksSpy = vi.spyOn(useBookmarksStore.getState(), 'hydrate')

    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(mockStorageService.getItem).toHaveBeenCalledTimes(3)
    })

    expect(hydrateSpy).not.toHaveBeenCalled()
    expect(hydrateSettingsSpy).not.toHaveBeenCalled()
    expect(hydrateBookmarksSpy).not.toHaveBeenCalled()
    unmount()
  })

  it('discards LAST_READ_POSITION with a legacy SEO-slug bookId', async () => {
    const lastRead = { bookId: SEO_SLUG_BOOK_ID, page: 3 }
    mockStorageService.getItem
      .mockResolvedValueOnce(lastRead)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(mockStorageService.getItem).toHaveBeenCalledTimes(3)
    })
    // Store must not be hydrated with the stale SEO slug
    expect(useReaderStore.getState().bookId).toBe('')
    unmount()
  })

  it('filters out legacy SEO-slug bookmarks and keeps valid UUID bookmarks', async () => {
    const bookmarks = [
      { bookId: SEO_SLUG_BOOK_ID, bookTitle: 'Stale', page: 1, timestamp: 1000 },
      { bookId: UUID_BOOK_ID, bookTitle: 'Valid', page: 5, timestamp: 2000 },
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

  it('does not hydrate bookmarks store when all persisted bookmarks are legacy SEO slugs', async () => {
    const bookmarks = [
      { bookId: SEO_SLUG_BOOK_ID, bookTitle: 'Stale', page: 1, timestamp: 1000 },
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
