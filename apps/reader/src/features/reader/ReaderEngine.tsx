import { useEffect, useRef, useState } from 'react'
import { useDOMPagination } from './useDOMPagination'
import { useReaderStore } from '@/stores/reader.store'
import { useSettingsStore } from '@/stores/settings.store'
import { coverPlaceholderStyle } from '@/shared/constants/cover'
import { resolveCoverUrl } from '@/shared/services/data.service'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { PageProgress } from './PageProgress'

// TODO: epub.js rewrite in Story 2.2
// ReaderEngine is being replaced with an epub.js-based reader. The DOM pagination
// engine (useDOMPagination), page/store sync, and storage persistence logic here
// are stubs kept to maintain a compiling, renderable state after the reader.store
// CFI migration (Story 3.1). Full rewrite in Story 2.2.

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
  // TODO: epub.js rewrite in Story 2.2 — currentPage is local state (not in reader.store after CFI migration)
  const [currentPage, setCurrentPage] = useState(0)
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
  // TODO: epub.js rewrite in Story 2.2 — bookId stub ('' until epub.js provides it)
  const paginationResult = useDOMPagination(
    paragraphs,
    measureRef,
    {
      bookId: '', // TODO: epub.js rewrite in Story 2.2
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

  // Clamp currentPage to valid range when pagination result changes
  // TODO: epub.js rewrite in Story 2.2 — store sync (setPages, setPageBoundaries) removed
  const lastSyncedPagesLengthRef = useRef(-1)
  useEffect(() => {
    if (paginationResult === null) return
    lastSyncedPagesLengthRef.current = pagesRef.current.length
    const totalPages = totalDisplayPagesRef.current
    if (currentPage > totalPages - 1) {
      setCurrentPage(totalPages - 1)
    }
  }, [paginationResult, pages.length, boundaries.length, totalDisplayPages, currentPage])

  // Reset to page 1 when font size changes (skip on initial mount to preserve hydrated lastReadPosition)
  const prevFontSizeRef = useRef(fontSize)
  useEffect(() => {
    if (prevFontSizeRef.current !== fontSize) {
      prevFontSizeRef.current = fontSize
      setCurrentPage(0)
    }
  }, [fontSize])

  // TODO: epub.js rewrite in Story 2.2 — persistPageChange will use CFI-based storage.
  // No-op stub: writing empty CFI/bookId would corrupt any valid LAST_READ_POSITION
  // saved from a previous session. Full implementation in Story 2.2.
  const persistPageChange = (_page: number) => {
    // intentional no-op until epub.js CFI navigation is wired in Story 2.2
  }

  // Navigation helpers — page 0 = cover, 1+ = content; totalDisplayPages = 1 + content pages
  const navigateNext = () => {
    if (currentPage < totalDisplayPagesRef.current - 1) {
      const nextPage = currentPage + 1
      setCurrentPage(nextPage)
      persistPageChange(nextPage)
    }
  }

  const navigatePrev = () => {
    if (currentPage > 0) {
      const prevPage = currentPage - 1
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
