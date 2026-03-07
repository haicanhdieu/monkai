import { useEffect, useMemo, useRef, useState } from 'react'
import { paginateBook } from '@/lib/pagination'
import type { PaginationOptions } from '@/lib/pagination'
import { useReaderStore } from '@/stores/reader.store'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { PageProgress } from './PageProgress'

// Default reader font metrics — consistent with body typography
const READER_FONT_SIZE = 18
const READER_LINE_HEIGHT = 1.6
const READER_PADDING_VERTICAL = 80 // accounts for fixed top + bottom chrome overlays
const READER_MAX_WIDTH = 700

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
  const { currentPage, setPages, setCurrentPage } = useReaderStore()
  const [fontsReady, setFontsReady] = useState(false)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 390,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }))

  // Wait for fonts before computing pagination to avoid fallback-font metric mismatch (AC 4 of 3.5)
  useEffect(() => {
    void document.fonts.ready.then(() => setFontsReady(true))
  }, [])

  // Keep pagination responsive to viewport changes (resize/orientation)
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
  const readerColumnMaxWidth = Math.min(
    READER_MAX_WIDTH,
    Math.max(280, viewport.width - horizontalPaddingTotal),
  )

  const options: PaginationOptions = useMemo(
    () => ({
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
      fontSize: READER_FONT_SIZE,
      lineHeight: READER_LINE_HEIGHT,
      paddingVertical: READER_PADDING_VERTICAL,
      contentMaxWidth: readerColumnMaxWidth,
      horizontalPadding: horizontalPaddingTotal,
    }),
    [horizontalPaddingTotal, readerColumnMaxWidth, viewport.height, viewport.width],
  )

  // Compute pages from paragraphs only after fonts are ready
  const computedPages = useMemo(() => {
    if (!fontsReady) return []
    return paginateBook(paragraphs, options)
  }, [fontsReady, paragraphs, options])

  // Keep a ref so keyboard/swipe handlers always see the latest page count
  // without stale closure issues (ref updated synchronously during render)
  const computedPagesRef = useRef<string[][]>([])
  computedPagesRef.current = computedPages

  // Sync computed pages into store (AC 1 of 3.3)
  useEffect(() => {
    if (computedPages.length > 0) {
      setPages(computedPages)
      const state = useReaderStore.getState()
      if (state.currentPage > computedPages.length - 1) {
        setCurrentPage(computedPages.length - 1)
      }
    }
  }, [computedPages, setCurrentPage, setPages])

  // Navigation helpers — read current page from store at call time, page count from ref
  const navigateNext = () => {
    const state = useReaderStore.getState()
    if (state.currentPage < computedPagesRef.current.length - 1) {
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

  // Keyboard navigation (AC 6)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') navigateNextRef.current()
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') navigatePrevRef.current()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, []) // stable: handlers read via refs

  // Touch/swipe handling (AC 2, 3)
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

  // Tap zone detection uses window.innerWidth so it works in JSDOM (no layout needed)
  // Left 20% → prev, right 20% → next, center 60% → delegated (AC 2, 3 of 3.3)
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (swipeHandled.current) return
    const ratio = e.clientX / (window.innerWidth || 1024)
    if (ratio < 0.2) navigatePrevRef.current()
    else if (ratio > 0.8) navigateNextRef.current()
    else onCenterTap?.()
  }

  // Loading state — skeleton while fonts initialise (AC 4 of 3.5).
  // paginateBook always returns at least [[]], so computedPages.length > 0 whenever fontsReady is true.
  if (!fontsReady) {
    return (
      <div className="flex-1 p-6" data-testid="reader-skeleton">
        <SkeletonText lines={14} />
      </div>
    )
  }

  const currentPageParagraphs = computedPages[currentPage] ?? []

  // Empty content guard (AC 3 of 3.5)
  const displayParagraphs =
    currentPageParagraphs.length === 0 ? [EMPTY_PAGE_MESSAGE] : currentPageParagraphs

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden cursor-pointer select-none"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      data-testid="reader-engine"
    >
      {/* Responsive reading column — max-width ~700px, centered (AC 5) */}
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

      {/* Page progress (AC 7) */}
      <div className="pb-4 px-6">
        <PageProgress currentPage={currentPage} totalPages={computedPages.length} />
      </div>
    </div>
  )
}
