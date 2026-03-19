import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface Bookmark {
  bookId: string
  bookTitle: string
  /** CFI-based position (epub.js); replaces legacy page number. */
  cfi: string
  timestamp: number
  type: 'auto' | 'manual'
  /** Current page from epub.js relocated (location.start.displayed.page). */
  page?: number
  /** Total pages from epub.js (location.start.displayed.total). */
  total?: number
}

interface BookmarksState {
  bookmarks: Bookmark[]
  upsertBookmark: (bookmark: Bookmark) => void
  addManualBookmark: (bookmark: Bookmark) => void
  removeManualBookmark: (bookId: string, cfi: string) => void
  hydrate: (bookmarks: Bookmark[]) => void
  clear: () => void
}

export const useBookmarksStore = create<BookmarksState>()(
  immer((set) => ({
    bookmarks: [],
    upsertBookmark: (bookmark) =>
      set((state) => {
        const idx = state.bookmarks.findIndex(
          (b) => b.bookId === bookmark.bookId && b.type === 'auto'
        )
        if (idx >= 0) {
          state.bookmarks[idx] = bookmark
        } else {
          state.bookmarks.push(bookmark)
        }
      }),
    addManualBookmark: (bookmark) =>
      set((state) => {
        const exists = state.bookmarks.some(
          (b) => b.bookId === bookmark.bookId && b.cfi === bookmark.cfi && b.type === 'manual'
        )
        if (!exists) {
          state.bookmarks.push({ ...bookmark, type: 'manual' })
        }
      }),
    removeManualBookmark: (bookId, cfi) =>
      set((state) => {
        state.bookmarks = state.bookmarks.filter(
          (b) => !(b.bookId === bookId && b.cfi === cfi && b.type === 'manual')
        )
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
