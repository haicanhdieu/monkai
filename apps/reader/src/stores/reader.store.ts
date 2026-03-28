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
  /** Chapter title at current reader position (from epub TOC, resolved on relocated). */
  currentChapterTitle: string
  /** Last-read book for home "continue reading" card (hydrated from storage + updated on relocate). */
  lastReadBookId: string
  lastReadBookTitle: string
  lastReadPage: number
  lastReadTotalPages: number
  /** Chapter title at last-read position, for home card display. */
  lastReadChapterTitle: string
  /** ~Whole-book progress [0,1] from linear spine + in-chapter page/total; null if unknown. */
  lastReadBookProgressApprox: number | null
  setCurrentCfi: (cfi: string) => void
  toggleChrome: () => void
  /** Set page progress from epub.js relocated (bottom bar). */
  setProgress: (page: number, total: number, chapterTitle?: string) => void
  /** Set last-read for home card and persist; called from ReaderEngine on relocate. */
  setLastRead: (
    bookId: string,
    bookTitle: string,
    page: number,
    total: number,
    chapterTitle?: string,
    bookProgressApprox?: number | null,
  ) => void
  /** Hydrate last-read from storage (useStorageHydration). */
  hydrateLastRead: (
    bookId: string,
    bookTitle: string,
    page: number,
    total: number,
    chapterTitle?: string,
    bookProgressApprox?: number | null,
  ) => void
  reset: () => void
}

const initialState = {
  currentCfi: null as string | null,
  isChromeVisible: true,
  currentPage: 0,
  totalPages: 0,
  currentChapterTitle: '',
  lastReadBookId: '',
  lastReadBookTitle: '',
  lastReadPage: 0,
  lastReadTotalPages: 0,
  lastReadChapterTitle: '',
  lastReadBookProgressApprox: null as number | null,
}

export const useReaderStore = create<ReaderState>((set) => ({
  ...initialState,
  setCurrentCfi: (currentCfi) => set({ currentCfi }),
  toggleChrome: () => set((state) => ({ isChromeVisible: !state.isChromeVisible })),
  setProgress: (currentPage, totalPages, currentChapterTitle = '') => set({ currentPage, totalPages, currentChapterTitle }),
  setLastRead: (
    lastReadBookId,
    lastReadBookTitle,
    lastReadPage,
    lastReadTotalPages,
    lastReadChapterTitle = '',
    lastReadBookProgressApprox = null,
  ) =>
    set({
      lastReadBookId,
      lastReadBookTitle,
      lastReadPage,
      lastReadTotalPages,
      lastReadChapterTitle,
      lastReadBookProgressApprox: lastReadBookProgressApprox ?? null,
    }),
  hydrateLastRead: (
    lastReadBookId,
    lastReadBookTitle,
    lastReadPage,
    lastReadTotalPages,
    lastReadChapterTitle = '',
    lastReadBookProgressApprox = null,
  ) =>
    set({
      lastReadBookId,
      lastReadBookTitle,
      lastReadPage,
      lastReadTotalPages,
      lastReadChapterTitle,
      lastReadBookProgressApprox: lastReadBookProgressApprox ?? null,
    }),
  reset: () => set(initialState),
}))
