import { useEffect, useRef, useState } from 'react'
import { useDOMPagination } from './useDOMPagination'
import { useReaderStore } from '@/stores/reader.store'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { PageProgress } from './PageProgress'

// Default reader font metrics — consistent with body typography
const READER_FONT_SIZE = 18
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
  onCenterTap?: () => void
}

export function ReaderEngine({ paragraphs, onCenterTap }: ReaderEngineProps) {
  const { bookId, currentPage, setPages, setCurrentPage, setPageBoundaries } = useReaderStore()
  const [fontsReady, setFontsReady] = useState(false)
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
      fontSize: READER_FONT_SIZE,
      lineHeight: READER_LINE_HEIGHT,
      fontFamily: 'Lora, serif',
    },
    fontsReady,
  )

  const pages = paginationResult?.pages ?? []
  const boundaries = paginationResult?.boundaries ?? [0]

  // Keep a ref so keyboard/swipe handlers always see the latest page count
  const pagesRef = useRef<string[][]>([])
  pagesRef.current = pages

  // Sync computed pages into store
  useEffect(() => {
    if (pages.length > 0) {
      setPages(pages)
      setPageBoundaries(boundaries)
      const state = useReaderStore.getState()
      if (state.currentPage > pages.length - 1) {
        setCurrentPage(pages.length - 1)
      }
    }
  }, [pages, boundaries, setCurrentPage, setPages, setPageBoundaries])

  // Navigation helpers — read current page from store at call time, page count from ref
  const navigateNext = () => {
    const state = useReaderStore.getState()
    if (state.currentPage < pagesRef.current.length - 1) {
      setCurrentPage(state.currentPage + 1)
    }
  }

  const navigatePrev = () => {
    const state = useReaderStore.getState()
    if (state.currentPage > 0) {
      setCurrentPage(state.currentPage - 1)
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
        fontSize: `${READER_FONT_SIZE}px`,
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

  const currentPageParagraphs = pages[currentPage] ?? []
  const displayParagraphs =
    currentPageParagraphs.length === 0 ? [EMPTY_PAGE_MESSAGE] : currentPageParagraphs

  return (
    <>
      <div
        className="flex-1 flex flex-col overflow-hidden cursor-pointer select-none"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        data-testid="reader-engine"
        data-page-total={pages.length}
      >
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
                fontSize: `${READER_FONT_SIZE}px`,
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

        {/* Page progress */}
        <div className="pb-4 px-6">
          <PageProgress currentPage={currentPage} totalPages={pages.length} />
        </div>
      </div>

      {measureDiv}
    </>
  )
}
