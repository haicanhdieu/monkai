import { create } from 'zustand'

export interface LastReadPosition {
  bookId: string
  page: number
  /** Total display pages (1 + content pages) for this book; used on home after refresh when pages are not yet loaded. */
  totalPages?: number
}

interface ReaderState {
  bookId: string
  bookTitle: string
  pages: string[][]
  pageBoundaries: number[]
  currentPage: number
  /** Persisted total display pages for last-read book; used when pages.length === 0 (e.g. after refresh on home). */
  lastReadTotalPages: number
  isChromeVisible: boolean
  hasSeenHint: boolean
  setBookId: (id: string) => void
  setBookTitle: (title: string) => void
  setPages: (pages: string[][]) => void
  setPageBoundaries: (boundaries: number[]) => void
  setCurrentPage: (page: number) => void
  toggleChrome: () => void
  dismissHint: () => void
  hydrate: (data: LastReadPosition) => void
  reset: () => void
}

const initialState = {
  bookId: '',
  bookTitle: '',
  pages: [] as string[][],
  pageBoundaries: [0] as number[],
  currentPage: 0,
  lastReadTotalPages: 0,
  isChromeVisible: true,
  hasSeenHint: false,
}

export const useReaderStore = create<ReaderState>((set) => ({
  ...initialState,
  setBookId: (bookId) => set({ bookId }),
  setBookTitle: (bookTitle) => set({ bookTitle }),
  setPages: (pages) =>
    set((state) => ({
      pages,
      lastReadTotalPages: pages.length > 0 ? 1 + pages.length : state.lastReadTotalPages,
    })),
  setPageBoundaries: (pageBoundaries) => set({ pageBoundaries }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  toggleChrome: () => set((state) => ({ isChromeVisible: !state.isChromeVisible })),
  dismissHint: () => set({ hasSeenHint: true }),
  hydrate: ({ bookId, page, totalPages }) =>
    set({ bookId, currentPage: page, lastReadTotalPages: totalPages ?? 0 }),
  reset: () => set(initialState),
}))
