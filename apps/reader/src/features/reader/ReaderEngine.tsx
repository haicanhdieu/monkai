import { useEffect, useRef, useState } from 'react'
import { useEpubReader } from './useEpubReader'
import { useReaderStore } from '@/stores/reader.store'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { useSettingsStore } from '@/stores/settings.store'
import { toEpubThemeName } from './epubThemes'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'
import { SkeletonText } from '@/shared/components/SkeletonText'
import ReaderErrorPage from './ReaderErrorPage'

/** Shape passed by epub.js rendition.on('relocated') — matches epub.js Location.start. */
interface RelocatedLocation {
  start?: {
    cfi?: string
    percentage?: number
    displayed?: { page: number; total: number }
  }
}

/** Persisted last-read position (bookTitle and page/total for home card and display). */
interface LastReadPosition {
  bookId: string
  cfi: string
  bookTitle?: string
  page?: number
  total?: number
}

export interface ReaderEngineProps {
  epubUrl: string
  bookId: string
  bookTitle: string
  /** When opening from a bookmark link, pass the saved CFI to open at that position. */
  initialCfi?: string | null
}

export function ReaderEngine({ epubUrl, bookId, bookTitle, initialCfi }: ReaderEngineProps) {
  const { containerRef, rendition, isReady, error } = useEpubReader(epubUrl)
  const { toggleChrome, setCurrentCfi, setProgress, setLastRead } = useReaderStore()
  const { theme, fontSize } = useSettingsStore()
  const [locationAnnouncement, setLocationAnnouncement] = useState('')
  const [resumeAttempted, setResumeAttempted] = useState(false)
  const bookmarkSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!rendition) return
    rendition.themes.select(toEpubThemeName(theme))
  }, [rendition, theme])

  useEffect(() => {
    if (!rendition) return
    rendition.themes.fontSize(`${fontSize}px`)
  }, [rendition, fontSize])

  useEffect(() => {
    if (!rendition) return

    const handleClick = (event: { clientX: number }) => {
      const x = event.clientX
      const width = window.innerWidth
      if (x < width * 0.2) {
        void rendition.prev()
      } else if (x > width * 0.8) {
        void rendition.next()
      } else {
        toggleChrome()
      }
    }

    const handleKeyup = (event: { key: string }) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') void rendition.next()
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') void rendition.prev()
    }

    const handleRelocated = (location: RelocatedLocation) => {
      const displayed = location?.start?.displayed
      const pct = location?.start?.percentage
      const text =
        displayed && displayed.total > 0
          ? `Trang ${displayed.page} / ${displayed.total}`
          : pct != null && !Number.isNaN(pct)
            ? `${Math.round(pct * 100)}%`
            : ''
      setLocationAnnouncement(text)

      if (displayed && displayed.total > 0) {
        setProgress(displayed.page, displayed.total)
        setLastRead(bookId, bookTitle, displayed.page, displayed.total)
      }

      const cfi = location?.start?.cfi
      if (typeof cfi === 'string' && cfi) {
        setCurrentCfi(cfi)
        const payload: LastReadPosition = {
          bookId,
          cfi,
          bookTitle,
          ...(displayed && displayed.total > 0 ? { page: displayed.page, total: displayed.total } : {}),
        }
        void storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, payload)
        useBookmarksStore.getState().upsertBookmark({
          bookId,
          bookTitle,
          cfi,
          timestamp: Date.now(),
          ...(displayed && displayed.total > 0 ? { page: displayed.page, total: displayed.total } : {}),
        })
        if (bookmarkSaveTimeoutRef.current) clearTimeout(bookmarkSaveTimeoutRef.current)
        bookmarkSaveTimeoutRef.current = setTimeout(() => {
          void storageService.setItem(
            STORAGE_KEYS.BOOKMARKS,
            useBookmarksStore.getState().bookmarks,
          )
          bookmarkSaveTimeoutRef.current = null
        }, 300)
      }
    }

    rendition.on('click', handleClick)
    rendition.on('keyup', handleKeyup)
    rendition.on('relocated', handleRelocated)

    return () => {
      if (bookmarkSaveTimeoutRef.current) {
        clearTimeout(bookmarkSaveTimeoutRef.current)
        bookmarkSaveTimeoutRef.current = null
      }
      rendition.off('click', handleClick)
      rendition.off('keyup', handleKeyup)
      rendition.off('relocated', handleRelocated)
    }
  }, [rendition, toggleChrome, setCurrentCfi, setProgress, setLastRead, bookId, bookTitle])

  // Resume from saved position or initialCfi (e.g. from bookmark link)
  useEffect(() => {
    if (!isReady || !rendition || resumeAttempted) return
    setResumeAttempted(true)

    if (initialCfi) {
      void rendition.display(initialCfi)
      return
    }

    void storageService
      .getItem<{ bookId?: string; cfi?: string }>(STORAGE_KEYS.LAST_READ_POSITION)
      .then((saved) => {
        if (saved && saved.bookId === bookId && saved.cfi) {
          void rendition.display(saved.cfi)
        } else {
          void rendition.display()
        }
      })
      .catch(() => {
        void rendition.display()
      })
  }, [isReady, rendition, bookId, initialCfi, resumeAttempted])

  if (error) {
    return <ReaderErrorPage category="parse" />
  }

  return (
    <div
      role="region"
      aria-label="Nội dung kinh"
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {locationAnnouncement}
      </div>
      {!isReady && (
        <div className="absolute inset-0 p-6" data-testid="reader-skeleton">
          <SkeletonText lines={14} />
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          visibility: isReady ? 'visible' : 'hidden',
        }}
        data-testid="epub-container"
      />
    </div>
  )
}
