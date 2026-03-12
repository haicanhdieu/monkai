import { create } from 'zustand'

interface ReaderState {
  currentCfi: string | null
  isChromeVisible: boolean
  setCurrentCfi: (cfi: string) => void
  toggleChrome: () => void
  reset: () => void
}

const initialState = {
  currentCfi: null as string | null,
  isChromeVisible: true,
}

export const useReaderStore = create<ReaderState>((set) => ({
  ...initialState,
  setCurrentCfi: (currentCfi) => set({ currentCfi }),
  toggleChrome: () => set((state) => ({ isChromeVisible: !state.isChromeVisible })),
  reset: () => set(initialState),
}))
