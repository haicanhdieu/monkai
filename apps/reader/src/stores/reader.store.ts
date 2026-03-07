import { create } from 'zustand'

interface ReaderState {
  bookId: string
  pages: string[][]
  currentPage: number
  isChromeVisible: boolean
  hasSeenHint: boolean
  setBookId: (id: string) => void
  setPages: (pages: string[][]) => void
  setCurrentPage: (page: number) => void
  toggleChrome: () => void
  dismissHint: () => void
  reset: () => void
}

const initialState = {
  bookId: '',
  pages: [] as string[][],
  currentPage: 0,
  isChromeVisible: true,
  hasSeenHint: false,
}

export const useReaderStore = create<ReaderState>((set) => ({
  ...initialState,
  setBookId: (bookId) => set({ bookId }),
  setPages: (pages) => set({ pages }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  toggleChrome: () => set((state) => ({ isChromeVisible: !state.isChromeVisible })),
  dismissHint: () => set({ hasSeenHint: true }),
  reset: () => set(initialState),
}))
