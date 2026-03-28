/**
 * Approximate progress through the whole EPUB from the current spine item and in-chapter page/total.
 *
 * EPUB has no reliable global "page" count without either (a) loading every spine section
 * (e.g. epub.js locations.generate) or (b) a publisher page-list in nav/NCX, which most books omit.
 * This uses linear spine order: (linearSpineIndex + page/total) / linearSpineCount.
 */

type SpineSection = { linear?: boolean; index: number; href?: string }

type MinimalSpine = {
  spineItems: SpineSection[]
  get: (target: string) => SpineSection | null | undefined
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

/**
 * @param book epub.js Book (duck-typed)
 * @param locationHref `location.start.href` from rendition relocated event
 * @param chapterPage in-chapter page from epub.js displayed.page (typically 1-based)
 * @param chapterTotal in-chapter total from epub.js displayed.total
 * @returns fraction in [0, 1] or null if spine cannot be resolved
 */
export function approxWholeBookProgressFromSpine(
  book: unknown,
  locationHref: string | undefined,
  chapterPage: number,
  chapterTotal: number,
): number | null {
  if (!isRecord(book) || typeof locationHref !== 'string' || !locationHref || chapterTotal <= 0) {
    return null
  }
  const spine = book.spine as MinimalSpine | undefined
  if (!spine?.spineItems?.length || typeof spine.get !== 'function') {
    return null
  }

  const cleanHref = locationHref.split('#')[0]
  let target = spine.get(cleanHref) ?? null
  if (!target && cleanHref.includes('/')) {
    const tail = cleanHref.slice(cleanHref.lastIndexOf('/') + 1)
    target = spine.get(tail) ?? null
  }
  if (!target?.linear) {
    return null
  }

  const linearItems = spine.spineItems.filter((s) => s.linear)
  if (linearItems.length === 0) {
    return null
  }

  const linearIndex = linearItems.findIndex((s) => s.index === target.index)
  if (linearIndex < 0) {
    return null
  }

  const within = Math.max(0, Math.min(1, chapterPage / chapterTotal))
  const fraction = (linearIndex + within) / linearItems.length
  return Math.max(0, Math.min(1, fraction))
}
