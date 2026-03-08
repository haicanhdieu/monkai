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

describe('useStorageHydration', () => {
  it('calls hydrate on each store with persisted values', async () => {
    const lastRead = { bookId: 'kinh-phap-hoa', page: 14 }
    const settings = { fontSize: 20, theme: 'dark' as const }
    const bookmarks = [{ bookId: 'kinh-phap-hoa', bookTitle: 'Kinh Pháp Hoa', page: 14, timestamp: 1000 }]

    mockStorageService.getItem
      .mockResolvedValueOnce(lastRead)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(bookmarks)

    const { unmount } = renderHook(() => useStorageHydration())
    await vi.waitFor(() => {
      expect(useReaderStore.getState().bookId).toBe('kinh-phap-hoa')
      expect(useReaderStore.getState().currentPage).toBe(14)
      expect(useSettingsStore.getState().fontSize).toBe(20)
      expect(useSettingsStore.getState().theme).toBe('dark')
      expect(useBookmarksStore.getState().bookmarks).toHaveLength(1)
    })
    unmount()
  })

  it('does not call hydrate when storage returns null', async () => {
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
})
