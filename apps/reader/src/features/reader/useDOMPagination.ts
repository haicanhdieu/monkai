import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { DOMPaginationOptions, PageBoundaries } from '@/lib/pagination/pagination.types'

const DEBOUNCE_MS = 100

function emptyResult(): PageBoundaries {
  return { pages: [[]], boundaries: [0] }
}

function buildCacheKey(options: DOMPaginationOptions, paragraphCount: number, vw: number, vh: number): string {
  return `pagination:${options.bookId}:${paragraphCount}:${Math.round(vw)}x${Math.round(vh)}:${options.fontSize}:${options.lineHeight}`
}

function readCache(key: string): PageBoundaries | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as PageBoundaries
  } catch {
    return null
  }
}

function writeCache(key: string, result: PageBoundaries): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(result))
  } catch {
    // sessionStorage full or unavailable — silently skip
  }
}

/**
 * Measure paragraphs into pages by appending DOM nodes to a hidden measurement
 * div and checking scrollHeight vs clientHeight after each append.
 *
 * Must be called with a live, connected DOM element.
 */
function measurePages(measureEl: HTMLDivElement, paragraphs: string[]): PageBoundaries {
  const pages: string[][] = []
  const boundaries: number[] = []
  let currentPage: string[] = []
  let currentBoundaryIdx = 0

  measureEl.innerHTML = ''

  function flushPage(startIdx: number) {
    boundaries.push(startIdx)
    pages.push(currentPage)
    currentPage = []
    measureEl.innerHTML = ''
  }

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim()
    if (!para) continue

    const el = document.createElement('p')
    el.textContent = para
    el.style.marginBottom = '1rem'
    el.style.overflowWrap = 'anywhere'
    el.style.wordBreak = 'break-word'
    measureEl.appendChild(el)

    if (measureEl.scrollHeight > measureEl.clientHeight) {
      if (currentPage.length === 0) {
        // Paragraph taller than a full page — place alone on its own page
        boundaries.push(i)
        pages.push([para])
        measureEl.innerHTML = ''
        currentBoundaryIdx = i + 1
      } else {
        // Current page is full — save it, start a new page with this paragraph
        flushPage(currentBoundaryIdx)
        currentBoundaryIdx = i
        currentPage = [para]

        const el2 = document.createElement('p')
        el2.textContent = para
        el2.style.marginBottom = '1rem'
        el2.style.overflowWrap = 'anywhere'
        el2.style.wordBreak = 'break-word'
        measureEl.appendChild(el2)
      }
    } else {
      currentPage.push(para)
    }
  }

  if (currentPage.length > 0) {
    boundaries.push(currentBoundaryIdx)
    pages.push(currentPage)
  }

  measureEl.innerHTML = ''
  return pages.length === 0 ? emptyResult() : { pages, boundaries }
}

/**
 * Hook that paginates `paragraphs` using actual DOM measurement via a hidden
 * `measureRef` div. Runs immediately on mount, then re-paginates on container
 * resize (ResizeObserver, debounced 100ms). Results are cached in sessionStorage
 * keyed by bookId, viewport dimensions, and font settings.
 *
 * Returns `null` until the first measurement completes — callers should show a
 * loading state while the result is null.
 *
 * @param paragraphs - array of paragraph strings to paginate
 * @param measureRef - ref to the hidden off-screen measurement div (must be in live DOM)
 * @param options - font/layout options including bookId for cache isolation
 * @param enabled - set false until fonts are ready
 */
export function useDOMPagination(
  paragraphs: string[],
  measureRef: RefObject<HTMLDivElement>,
  options: DOMPaginationOptions,
  enabled: boolean,
): PageBoundaries | null {
  // null = not yet computed; callers show skeleton while null
  const [result, setResult] = useState<PageBoundaries | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    function runMeasurement() {
      const el = measureRef.current
      if (cancelled || !el || !el.isConnected) return

      // Use live element dimensions for cache key (avoids stale containerSize race)
      const vw = el.offsetWidth || options.columnWidth
      const vh = el.offsetHeight || options.availableHeight
      const cacheKey = buildCacheKey(options, paragraphs.length, vw, vh)

      const cached = readCache(cacheKey)
      if (cached) {
        if (!cancelled) setResult(cached)
        return
      }

      const measured = measurePages(el, paragraphs)
      writeCache(cacheKey, measured)
      if (!cancelled) setResult(measured)
    }

    // Run immediately on (re)mount — no debounce needed for the initial measurement
    runMeasurement()

    // ResizeObserver handles subsequent resizes (debounced)
    const observer = new ResizeObserver(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(runMeasurement, DEBOUNCE_MS)
    })

    if (measureRef.current) {
      observer.observe(measureRef.current)
    }

    return () => {
      cancelled = true
      observer.disconnect()
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [
    enabled,
    paragraphs,
    measureRef,
    options.bookId,
    options.columnWidth,
    options.availableHeight,
    options.fontSize,
    options.lineHeight,
    options.fontFamily,
  ])

  return result
}
