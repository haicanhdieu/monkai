import { describe, it, expect, beforeEach } from 'vitest'
import { useBookmarksStore } from './bookmarks.store'
import type { Bookmark } from './bookmarks.store'

const AUTO_BOOKMARK: Bookmark = {
  bookId: 'book-a',
  bookTitle: 'Book A',
  cfi: 'epubcfi(/6/2!/4/2/1:0)',
  type: 'auto',
  timestamp: 1000,
}

const MANUAL_BOOKMARK: Bookmark = {
  bookId: 'book-a',
  bookTitle: 'Book A',
  cfi: 'epubcfi(/6/6!/4/2/1:0)',
  type: 'manual',
  timestamp: 2000,
}

beforeEach(() => {
  useBookmarksStore.setState({ bookmarks: [] })
})

describe('upsertBookmark', () => {
  it('replaces the auto-bookmark for the same bookId', () => {
    useBookmarksStore.getState().upsertBookmark(AUTO_BOOKMARK)
    const updated = { ...AUTO_BOOKMARK, cfi: 'epubcfi(/6/4!/4/2/1:0)', timestamp: 1500 }
    useBookmarksStore.getState().upsertBookmark(updated)

    const bookmarks = useBookmarksStore.getState().bookmarks
    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0].cfi).toBe('epubcfi(/6/4!/4/2/1:0)')
  })

  it('does NOT replace a manual bookmark when upsertBookmark is called with same bookId', () => {
    useBookmarksStore.getState().addManualBookmark(MANUAL_BOOKMARK)
    useBookmarksStore.getState().upsertBookmark(AUTO_BOOKMARK)

    const bookmarks = useBookmarksStore.getState().bookmarks
    expect(bookmarks).toHaveLength(2)
    expect(bookmarks.find((b) => b.type === 'manual')).toBeDefined()
    expect(bookmarks.find((b) => b.type === 'auto')).toBeDefined()
  })
})

describe('addManualBookmark', () => {
  it('adds a bookmark to the store', () => {
    useBookmarksStore.getState().addManualBookmark(MANUAL_BOOKMARK)
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(1)
    expect(useBookmarksStore.getState().bookmarks[0]).toMatchObject(MANUAL_BOOKMARK)
  })

  it('is idempotent: same bookId + cfi twice → only one entry', () => {
    useBookmarksStore.getState().addManualBookmark(MANUAL_BOOKMARK)
    useBookmarksStore.getState().addManualBookmark(MANUAL_BOOKMARK)
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(1)
  })

  it('allows different cfi values for the same bookId', () => {
    const second: Bookmark = { ...MANUAL_BOOKMARK, cfi: 'epubcfi(/6/8!/4/2/1:0)' }
    useBookmarksStore.getState().addManualBookmark(MANUAL_BOOKMARK)
    useBookmarksStore.getState().addManualBookmark(second)
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(2)
  })
})

describe('removeManualBookmark', () => {
  it('removes the matching manual bookmark', () => {
    useBookmarksStore.getState().addManualBookmark(MANUAL_BOOKMARK)
    useBookmarksStore.getState().removeManualBookmark(MANUAL_BOOKMARK.bookId, MANUAL_BOOKMARK.cfi)
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(0)
  })

  it('does NOT remove an auto-bookmark with the same bookId + cfi', () => {
    // auto and manual at the same cfi
    const autoAtSameCfi: Bookmark = { ...AUTO_BOOKMARK, cfi: MANUAL_BOOKMARK.cfi }
    useBookmarksStore.getState().upsertBookmark(autoAtSameCfi)
    useBookmarksStore.getState().addManualBookmark(MANUAL_BOOKMARK)

    useBookmarksStore.getState().removeManualBookmark(MANUAL_BOOKMARK.bookId, MANUAL_BOOKMARK.cfi)

    const bookmarks = useBookmarksStore.getState().bookmarks
    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0].type).toBe('auto')
  })

  it('is a no-op on non-existent entry (no error, store unchanged)', () => {
    useBookmarksStore.getState().upsertBookmark(AUTO_BOOKMARK)
    useBookmarksStore.getState().removeManualBookmark('book-a', 'epubcfi(/6/6!/4/2/1:0)')
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(1)
  })
})
