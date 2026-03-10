import { useEffect, useRef, useState } from 'react'
import { useDOMPagination } from './useDOMPagination'
import { useReaderStore } from '@/stores/reader.store'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { useSettingsStore } from '@/stores/settings.store'
import { storageService } from '@/shared/services/storage.service'
import { coverPlaceholderStyle } from '@/shared/constants/cover'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'
import { resolveCoverUrl } from '@/shared/services/data.service'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { PageProgress } from './PageProgress'

// Default reader font metrics — consistent with body typography
const READER_LINE_HEIGHT = 1.6
const READER_PADDING_BOTTOM = 0 // tall enough to account for PageProgress and vertical padding to avoid overlap

const EMPTY_PAGE_MESSAGE = 'Nội dung trống.'
const SWIPE_THRESHOLD = 50 // px

function getHorizontalPaddingPerSidePx(viewportWidth: number): number {
  if (viewportWidth < 420) return 12
  if (viewportWidth < 768) return 16
  return 24
}

interface ReaderEngineProps {
  paragraphs: string[]
  coverImageUrl: string | null
  bookTitle: string
  onCenterTap?: () => void
}

export function ReaderEngine({ paragraphs, coverImageUrl, bookTitle, onCenterTap }: ReaderEngineProps) {
  const { bookId, currentPage, setPages, setCurrentPage, setPageBoundaries } = useReaderStore()
  const { fontSize } = useSettingsStore()
  const [fontsReady, setFontsReady] = useState(false)
  const [coverError, setCoverError] = useState(false)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 390,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }))
  // Always mounted — never inside a conditional branch — so measureRef.current is stable
  const measureRef = useRef<HTMLDivElement>(null)

  // Wait for fonts before computing pagination to avoid fallback-font metric mismatch
  useEffect(() => {
    void document.fonts.ready.then(() => setFontsReady(true))
  }, [])

  // Track viewport for column width calculation
  useEffect(() => {
    function syncViewport() {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }
    syncViewport()
    window.addEventListener('resize', syncViewport)
    window.addEventListener('orientationchange', syncViewport)
    return () => {
      window.removeEventListener('resize', syncViewport)
      window.removeEventListener('orientationchange', syncViewport)
    }
  }, [])

  const horizontalPaddingPerSide = getHorizontalPaddingPerSidePx(viewport.width)
  const horizontalPaddingTotal = horizontalPaddingPerSide * 2
  const readerColumnMaxWidth = Math.max(280, viewport.width - horizontalPaddingTotal)
  const availableHeight = viewport.height - Math.max(0, READER_PADDING_BOTTOM)

  // null = not yet computed; show skeleton until first measurement completes
  const paginationResult = useDOMPagination(
    paragraphs,
    measureRef,
    {
      bookId,
      availableHeight,
      columnWidth: readerColumnMaxWidth,
      fontSize,
      lineHeight: READER_LINE_HEIGHT,
      fontFamily: 'Lora, serif',
    },
    fontsReady,
  )

  const pages = paginationResult?.pages ?? []
  const boundaries = paginationResult?.boundaries ?? [0]
  const totalDisplayPages = 1 + pages.length

  // Keep refs so keyboard/swipe handlers and sync effect see latest values
  const pagesRef = useRef<string[][]>([])
  pagesRef.current = pages
  const boundariesRef = useRef<number[]>([0])
  boundariesRef.current = boundaries
  const totalDisplayPagesRef = useRef(totalDisplayPages)
  totalDisplayPagesRef.current = totalDisplayPages

  // Sync computed pages into store when pagination result changes; clamp currentPage to [0, totalDisplayPages - 1]
  // Only run when pagination is ready so we don't overwrite bookmark page (e.g. 15) with clamp to 0 while result is still null.
  // paginationResult in deps re-runs when result becomes available or after re-measurement (useDOMPagination returns stable reference until then).
  // pages.length/boundaries.length in deps avoid re-running every render (pages/boundaries are new refs from hook); we read latest from refs.
  // When result is non-null but pages empty (e.g. no content), we still sync and clamp so store stays consistent.
  const lastSyncedPagesLengthRef = useRef(-1)
  useEffect(() => {
    if (paginationResult === null) return
    const currentPages = pagesRef.current
    const currentBoundaries = boundariesRef.current
    const totalPages = totalDisplayPagesRef.current
    if (currentPages.length !== lastSyncedPagesLengthRef.current) {
      lastSyncedPagesLengthRef.current = currentPages.length
      setPages(currentPages)
      setPageBoundaries(currentBoundaries)
    }
    const state = useReaderStore.getState()
    if (state.currentPage > totalPages - 1) {
      setCurrentPage(totalPages - 1)
    }
  }, [paginationResult, pages.length, boundaries.length, totalDisplayPages, setCurrentPage, setPages, setPageBoundaries])

  // Reset to page 1 when font size changes (skip on initial mount to preserve hydrated lastReadPosition)
  const prevFontSizeRef = useRef(fontSize)
  useEffect(() => {
    if (prevFontSizeRef.current !== fontSize) {
      prevFontSizeRef.current = fontSize
      setCurrentPage(0)
    }
  }, [fontSize, setCurrentPage])

  // Persist page change to storage and update bookmarks store (include totalPages for home display after refresh)
  const persistPageChange = (page: number) => {
    const { bookId: id, bookTitle: title } = useReaderStore.getState()
    const totalPages = totalDisplayPagesRef.current
    void storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId: id, page, totalPages })
    useBookmarksStore.getState().upsertBookmark({ bookId: id, bookTitle: title, page, timestamp: Date.now() })
    void storageService.setItem(STORAGE_KEYS.BOOKMARKS, useBookmarksStore.getState().bookmarks)
  }

  // Navigation helpers — page 0 = cover, 1+ = content; totalDisplayPages = 1 + content pages
  const navigateNext = () => {
    const state = useReaderStore.getState()
    if (state.currentPage < totalDisplayPagesRef.current - 1) {
      const nextPage = state.currentPage + 1
      setCurrentPage(nextPage)
      persistPageChange(nextPage)
    }
  }

  const navigatePrev = () => {
    const state = useReaderStore.getState()
    if (state.currentPage > 0) {
      const prevPage = state.currentPage - 1
      setCurrentPage(prevPage)
      persistPageChange(prevPage)
    }
  }

  // Keep refs so the keyboard effect never goes stale
  const navigateNextRef = useRef(navigateNext)
  navigateNextRef.current = navigateNext
  const navigatePrevRef = useRef(navigatePrev)
  navigatePrevRef.current = navigatePrev

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') navigateNextRef.current()
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') navigatePrevRef.current()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, []) // stable: handlers read via refs

  // Touch/swipe handling
  const touchStartX = useRef(0)
  const swipeHandled = useRef(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    swipeHandled.current = false
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(delta) > SWIPE_THRESHOLD) {
      swipeHandled.current = true
      if (delta < 0) navigateNextRef.current() // swipe left → next
      else navigatePrevRef.current() // swipe right → prev
    }
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (swipeHandled.current) return
    const ratio = e.clientX / (window.innerWidth || 1024)
    if (ratio < 0.2) navigatePrevRef.current()
    else if (ratio > 0.8) navigateNextRef.current()
    else onCenterTap?.()
  }

  // Hidden measurement div — always in the DOM (never inside a conditional branch) so
  // measureRef.current is stable and the ResizeObserver never loses its target on
  // skeleton ↔ content transitions
  const measureDiv = (
    <div
      ref={measureRef}
      aria-hidden="true"
      data-testid="reader-measure-div"
      style={{
        position: 'absolute',
        top: '-9999px',
        left: '-9999px',
        visibility: 'hidden',
        overflow: 'hidden',
        width: `${readerColumnMaxWidth}px`,
        height: `${availableHeight}px`,
        fontSize: `${fontSize}px`,
        lineHeight: READER_LINE_HEIGHT,
        fontFamily: 'Lora, serif',
        paddingInline: `${horizontalPaddingPerSide}px`,
      }}
    />
  )

  // Show skeleton while fonts are loading OR while first DOM measurement is pending
  if (!fontsReady || paginationResult === null) {
    return (
      <>
        <div className="flex-1 p-6" data-testid="reader-skeleton">
          <SkeletonText lines={14} />
        </div>
        {measureDiv}
      </>
    )
  }

  // Page 0 = cover (or placeholder); page 1+ = content
  const isCoverPage = currentPage === 0
  const contentPageIndex = currentPage - 1
  const currentPageParagraphs = contentPageIndex >= 0 && contentPageIndex < pages.length ? pages[contentPageIndex] ?? [] : []
  const displayParagraphs =
    currentPageParagraphs.length === 0 ? [EMPTY_PAGE_MESSAGE] : currentPageParagraphs

  const coverUrlResolved = coverImageUrl ? resolveCoverUrl(coverImageUrl) : null

  return (
    <>
      <div
        className="flex-1 flex flex-col overflow-hidden cursor-pointer select-none"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        data-testid="reader-engine"
        data-page-total={totalDisplayPages}
      >
        {isCoverPage ? (
          <CoverPage
            coverUrl={coverUrlResolved}
            bookTitle={bookTitle}
            placeholderStyle={coverPlaceholderStyle}
            coverError={coverError}
            onCoverError={() => setCoverError(true)}
          />
        ) : (
          <>
            {/* Responsive reading column — max-width ~700px, centered */}
            <div
              className="mx-auto w-full flex-1 overflow-hidden py-4"
              style={{
                maxWidth: `${readerColumnMaxWidth}px`,
                paddingInline: `${horizontalPaddingPerSide}px`,
              }}
              role="region"
              aria-live="polite"
              aria-label="Nội dung kinh"
              data-testid="reader-text-column"
            >
              {displayParagraphs.map((para, i) => (
                <p
                  key={i}
                  className="mb-4 leading-relaxed"
                  style={{
                    fontSize: `${fontSize}px`,
                    lineHeight: READER_LINE_HEIGHT,
                    color: 'var(--color-text)',
                    fontFamily: 'Lora, serif',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {para}
                </p>
              ))}
            </div>
          </>
        )}

        {/* Page progress */}
        <div className="pb-4 px-6">
          <PageProgress currentPage={currentPage} totalPages={totalDisplayPages} />
        </div>
      </div>

      {measureDiv}
    </>
  )
}

function CoverPage({
  coverUrl,
  bookTitle,
  placeholderStyle,
  coverError,
  onCoverError,
}: {
  coverUrl: string | null
  bookTitle: string
  placeholderStyle: React.CSSProperties
  coverError: boolean
  onCoverError: () => void
}) {
  const [coverLoaded, setCoverLoaded] = useState(false)

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-6"
      data-testid="reader-cover-page"
    >
      {coverUrl && !coverError ? (
        <>
          {!coverLoaded && (
            <div
              className="absolute inset-0 flex items-center justify-center p-6"
              style={placeholderStyle}
              aria-hidden="true"
            />
          )}
          <img
            src={coverUrl}
            alt=""
            className="max-h-full max-w-full object-contain"
            onLoad={() => setCoverLoaded(true)}
            onError={onCoverError}
          />
        </>
      ) : (
        <div
          className="flex flex-1 flex-col items-center justify-center rounded-xl px-8 py-12 w-full max-w-md"
          style={placeholderStyle}
        >
          <p
            className="text-center text-xl font-semibold"
            style={{ fontFamily: 'Lora, serif', color: 'var(--color-text)' }}
          >
            {bookTitle}
          </p>
        </div>
      )}
    </div>
  )
}
