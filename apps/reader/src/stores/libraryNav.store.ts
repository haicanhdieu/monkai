import { create } from 'zustand'

interface LibraryNavState {
  savedQuery: string
  savedScrollTop: number
  setSavedQuery: (q: string) => void
  setSavedScrollTop: (n: number) => void
  clear: () => void
}

export const useLibraryNavStore = create<LibraryNavState>((set) => ({
  savedQuery: '',
  savedScrollTop: 0,
  setSavedQuery: (savedQuery) => set({ savedQuery }),
  setSavedScrollTop: (savedScrollTop) => set({ savedScrollTop }),
  clear: () => set({ savedQuery: '', savedScrollTop: 0 }),
}))
