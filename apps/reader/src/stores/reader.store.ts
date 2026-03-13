import { create } from 'zustand'

/** Page progress from epub.js relocated (location.start.displayed). */
export interface PageDisplay {
  page: number
  total: number
}

interface ReaderState {
  currentCfi: string | null
  isChromeVisible: boolean
  /** Current page/total in reader (from epub.js relocated). */
  currentPage: number
  totalPages: number
  /** Last-read book for home "continue reading" card (hydrated from storage + updated on relocate). */
  lastReadBookId: string
  lastReadBookTitle: string
  lastReadPage: number
  lastReadTotalPages: number
  setCurrentCfi: (cfi: string) => void
  toggleChrome: () => void
  /** Set page progress from epub.js relocated (bottom bar). */
  setProgress: (page: number, total: number) => void
  /** Set last-read for home card and persist; called from ReaderEngine on relocate. */
  setLastRead: (bookId: string, bookTitle: string, page: number, total: number) => void
  /** Hydrate last-read from storage (useStorageHydration). */
  hydrateLastRead: (bookId: string, bookTitle: string, page: number, total: number) => void
  reset: () => void
}

const initialState = {
  currentCfi: null as string | null,
  isChromeVisible: true,
  currentPage: 0,
  totalPages: 0,
  lastReadBookId: '',
  lastReadBookTitle: '',
  lastReadPage: 0,
  lastReadTotalPages: 0,
}

export const useReaderStore = create<ReaderState>((set) => ({
  ...initialState,
  setCurrentCfi: (currentCfi) => set({ currentCfi }),
  toggleChrome: () => set((state) => ({ isChromeVisible: !state.isChromeVisible })),
  setProgress: (currentPage, totalPages) => set({ currentPage, totalPages }),
  setLastRead: (lastReadBookId, lastReadBookTitle, lastReadPage, lastReadTotalPages) =>
    set({ lastReadBookId, lastReadBookTitle, lastReadPage, lastReadTotalPages }),
  hydrateLastRead: (lastReadBookId, lastReadBookTitle, lastReadPage, lastReadTotalPages) =>
    set({ lastReadBookId, lastReadBookTitle, lastReadPage, lastReadTotalPages }),
  reset: () => set(initialState),
}))
