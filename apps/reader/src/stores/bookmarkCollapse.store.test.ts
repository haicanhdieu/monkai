import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useBookmarkCollapseStore } from './bookmarkCollapse.store'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'

vi.mock('@/shared/services/storage.service', () => ({
  storageService: {
    setItem: vi.fn().mockResolvedValue(undefined),
    getItem: vi.fn().mockResolvedValue(null),
  },
}))

beforeEach(() => {
  useBookmarkCollapseStore.setState({ expandedBookIds: [] })
  vi.clearAllMocks()
})

describe('bookmarkCollapse.store', () => {
  it('defaults to an empty set (all groups collapsed)', () => {
    expect(useBookmarkCollapseStore.getState().expandedBookIds).toEqual([])
    expect(useBookmarkCollapseStore.getState().isExpanded('book-a')).toBe(false)
  })

  it('toggle adds a bookId, then removes it on a second toggle', () => {
    const { toggle } = useBookmarkCollapseStore.getState()
    toggle('book-a')
    expect(useBookmarkCollapseStore.getState().expandedBookIds).toEqual(['book-a'])
    expect(useBookmarkCollapseStore.getState().isExpanded('book-a')).toBe(true)

    toggle('book-a')
    expect(useBookmarkCollapseStore.getState().expandedBookIds).toEqual([])
    expect(useBookmarkCollapseStore.getState().isExpanded('book-a')).toBe(false)
  })

  it('toggle persists the resulting set via storageService', () => {
    useBookmarkCollapseStore.getState().toggle('book-a')
    expect(storageService.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.BOOKMARK_GROUP_STATE,
      ['book-a'],
    )
  })

  it('hydrate replaces the set wholesale', () => {
    useBookmarkCollapseStore.getState().toggle('book-a')
    useBookmarkCollapseStore.getState().hydrate(['book-x', 'book-y'])
    expect(useBookmarkCollapseStore.getState().expandedBookIds).toEqual(['book-x', 'book-y'])
  })

  it('clear empties the set', () => {
    useBookmarkCollapseStore.getState().hydrate(['book-a', 'book-b'])
    useBookmarkCollapseStore.getState().clear()
    expect(useBookmarkCollapseStore.getState().expandedBookIds).toEqual([])
  })
})
