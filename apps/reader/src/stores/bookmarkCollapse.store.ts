import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'

interface BookmarkCollapseState {
  /** Deviation-from-default: bookIds the user has expanded. Default [] = all groups collapsed. */
  expandedBookIds: string[]
  /** Presence check. NOTE: read via getState() this is a snapshot — components must subscribe to
   * `expandedBookIds` for reactivity, not call this from getState(). */
  isExpanded: (bookId: string) => boolean
  /** Add/remove a bookId from the expanded set and persist the result to localforage. */
  toggle: (bookId: string) => void
  /** Replace the set with the reconciled ids loaded at hydration. */
  hydrate: (ids: string[]) => void
  clear: () => void
}

export const useBookmarkCollapseStore = create<BookmarkCollapseState>()(
  immer((set, get) => ({
    expandedBookIds: [],
    isExpanded: (bookId) => get().expandedBookIds.includes(bookId),
    toggle: (bookId) => {
      set((state) => {
        const idx = state.expandedBookIds.indexOf(bookId)
        if (idx >= 0) {
          state.expandedBookIds.splice(idx, 1)
        } else {
          state.expandedBookIds.push(bookId)
        }
      })
      void storageService.setItem(STORAGE_KEYS.BOOKMARK_GROUP_STATE, get().expandedBookIds)
    },
    hydrate: (ids) =>
      set((state) => {
        state.expandedBookIds = ids
      }),
    clear: () =>
      set((state) => {
        state.expandedBookIds = []
      }),
  }))
)
