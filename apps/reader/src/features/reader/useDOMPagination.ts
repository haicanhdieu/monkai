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
 * Split an overlong paragraph (taller than one page) into word-based chunks
 * that each fit within the measurement container's clientHeight.
 */
function splitOverlongParagraph(measureEl: HTMLDivElement, text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return [text]

  const chunks: string[] = []
  let startIdx = 0

  while (startIdx < words.length) {
    measureEl.innerHTML = ''
    const p = document.createElement('p')
    p.style.marginBottom = '1rem'
    p.style.overflowWrap = 'anywhere'
    p.style.wordBreak = 'break-word'
    measureEl.appendChild(p)

    // Accumulate words incrementally (O(n) instead of O(n²) slice+join)
    let accumulated = ''
    let endIdx = startIdx
    for (let j = startIdx; j < words.length; j++) {
      const next = accumulated ? accumulated + ' ' + words[j] : words[j]
      p.textContent = next
      if (measureEl.scrollHeight > measureEl.clientHeight) {
        // If even a single word overflows, take it alone to avoid infinite loop
        if (j === startIdx) {
          endIdx = j + 1
          accumulated = next
        } else {
          endIdx = j
        }
        break
      }
      accumulated = next
      endIdx = j + 1
    }

    // If we consumed all remaining words without overflow
    if (endIdx === startIdx) endIdx = startIdx + 1

    // In the single-word-overflow case, accumulated already has the word.
    // In multi-word case, accumulated has text before the overflow word.
    // In no-overflow case, accumulated has all remaining words.
    chunks.push(accumulated || words[startIdx])
    startIdx = endIdx
  }

  measureEl.innerHTML = ''
  return chunks
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
        // Paragraph taller than a full page — split into chunks
        const chunks = splitOverlongParagraph(measureEl, para)
        for (const chunk of chunks) {
          boundaries.push(i)
          pages.push([chunk])
        }
        measureEl.innerHTML = ''
        currentBoundaryIdx = i + 1
      } else {
        // Current page is full — save it, start a new page with this paragraph
        flushPage(currentBoundaryIdx)
        currentBoundaryIdx = i

        // Re-measure the paragraph alone on fresh page
        const el2 = document.createElement('p')
        el2.textContent = para
        el2.style.marginBottom = '1rem'
        el2.style.overflowWrap = 'anywhere'
        el2.style.wordBreak = 'break-word'
        measureEl.appendChild(el2)

        if (measureEl.scrollHeight > measureEl.clientHeight) {
          // Still overflows alone — split it
          const chunks = splitOverlongParagraph(measureEl, para)
          for (const chunk of chunks) {
            boundaries.push(i)
            pages.push([chunk])
          }
          measureEl.innerHTML = ''
          currentPage = []
          currentBoundaryIdx = i + 1
        } else {
          currentPage = [para]
        }
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
