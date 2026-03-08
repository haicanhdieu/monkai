import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface Bookmark {
  bookId: string
  bookTitle: string
  page: number
  timestamp: number
}

interface BookmarksState {
  bookmarks: Bookmark[]
  upsertBookmark: (bookmark: Bookmark) => void
  hydrate: (bookmarks: Bookmark[]) => void
  clear: () => void
}

export const useBookmarksStore = create<BookmarksState>()(
  immer((set) => ({
    bookmarks: [],
    upsertBookmark: (bookmark) =>
      set((state) => {
        const idx = state.bookmarks.findIndex((b) => b.bookId === bookmark.bookId)
        if (idx >= 0) {
          state.bookmarks[idx] = bookmark
        } else {
          state.bookmarks.push(bookmark)
        }
      }),
    hydrate: (bookmarks) =>
      set((state) => {
        state.bookmarks = bookmarks
      }),
    clear: () =>
      set((state) => {
        state.bookmarks = []
      }),
  }))
)
