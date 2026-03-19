import { useEffect, useRef, useState } from 'react'
// Types for props only; epub.js runtime is used only in useEpubReader
import type { Book, Rendition } from 'epubjs' // eslint-disable-line no-restricted-imports
import { useReaderStore } from '@/stores/reader.store'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { useSettingsStore } from '@/stores/settings.store'
import { EPUB_THEMES, toEpubThemeName } from './epubThemes'
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
  containerRef: React.RefObject<HTMLDivElement>
  rendition: Rendition | null
  book: Book | null
  isReady: boolean
  error: Error | null
  bookId: string
  bookTitle: string
  /** When opening from a bookmark link, pass the saved CFI to open at that position. */
  initialCfi?: string | null
}

export function ReaderEngine({
  containerRef,
  rendition,
  isReady,
  error,
  bookId,
  bookTitle,
  initialCfi,
}: ReaderEngineProps) {
  const { toggleChrome, setCurrentCfi, setProgress, setLastRead } = useReaderStore()
  const { theme, fontSize } = useSettingsStore()
  const [locationAnnouncement, setLocationAnnouncement] = useState('')
  const [resumeAttempted, setResumeAttempted] = useState(false)
  const bookmarkSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!rendition) return
    const themeName = toEpubThemeName(theme)
    rendition.themes.select(themeName)
    // Workaround for epub.js #1208: select() does not re-apply when switching back to a
    // previously selected theme. Applying body styles via override() forces the iframe to update.
    const bodyStyles = EPUB_THEMES[themeName].body
    rendition.themes.override('background', bodyStyles.background, true)
    rendition.themes.override('color', bodyStyles.color, true)
    rendition.themes.override('font-family', bodyStyles.fontFamily, true)
  }, [rendition, theme])

  useEffect(() => {
    if (!rendition) return
    rendition.themes.fontSize(`${fontSize}px`)
  }, [rendition, fontSize])

  useEffect(() => {
    if (!rendition) return

    // Tap navigation (prev/next) is handled by fixed overlay divs in the JSX, which live in
    // the outer React document and have reliable coordinates. rendition.on('click') is kept
    // only for chrome toggle on taps that reach the epub iframe (center 60%).
    const handleClick = () => {
      toggleChrome()
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
          type: 'auto',
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

      {/* Fixed tap zones in the outer DOM — avoids epub.js iframe coordinate issues.
          Left 20%: go to previous page. Right 20%: go to next page.
          z-index 10 matches ChromelessLayout's center zone so all three zones are on the same layer. */}
      {rendition && (
        <>
          <div
            aria-hidden="true"
            data-testid="tap-prev"
            style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: '20%', zIndex: 10 }}
            onClick={() => void rendition.prev()}
          />
          <div
            aria-hidden="true"
            data-testid="tap-next"
            style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '20%', zIndex: 10 }}
            onClick={() => void rendition.next()}
          />
        </>
      )}
    </div>
  )
}
