import { create } from 'zustand'

export interface LastReadPosition {
  bookId: string
  page: number
}

interface ReaderState {
  bookId: string
  bookTitle: string
  pages: string[][]
  pageBoundaries: number[]
  currentPage: number
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
  isChromeVisible: true,
  hasSeenHint: false,
}

export const useReaderStore = create<ReaderState>((set) => ({
  ...initialState,
  setBookId: (bookId) => set({ bookId }),
  setBookTitle: (bookTitle) => set({ bookTitle }),
  setPages: (pages) => set({ pages }),
  setPageBoundaries: (pageBoundaries) => set({ pageBoundaries }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  toggleChrome: () => set((state) => ({ isChromeVisible: !state.isChromeVisible })),
  dismissHint: () => set({ hasSeenHint: true }),
  hydrate: ({ bookId, page }) => set({ bookId, currentPage: page }),
  reset: () => set(initialState),
}))
