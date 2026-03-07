/**
 * Options controlling how content is split into pages.
 *
 * Assumptions:
 * - `viewportHeight` is the total screen height in CSS pixels.
 * - `fontSize` is in CSS pixels (e.g. 16).
 * - `lineHeight` is a unitless multiplier (e.g. 1.5 means 1.5× the font size).
 * - `paddingVertical` is the vertical padding applied symmetrically to each page
 *   (top + bottom = 2 × paddingVertical). Available text height per page is
 *   `viewportHeight - 2 * paddingVertical`.
 */
export interface PaginationOptions {
  viewportHeight: number
  viewportWidth?: number
  fontSize: number
  lineHeight: number
  paddingVertical: number
  contentMaxWidth?: number
  horizontalPadding?: number
}

/**
 * Result of DOM-based pagination.
 * - `pages`: paragraph content per page (for rendering).
 * - `boundaries`: paragraph index of the first paragraph on each page (for bookmarks).
 */
export interface PageBoundaries {
  pages: string[][]
  boundaries: number[]
}

/**
 * Options for DOM-measurement pagination hook.
 */
export interface DOMPaginationOptions {
  bookId: string          // used as part of sessionStorage cache key to prevent cross-book collisions
  availableHeight: number // px — container height (viewportHeight - verticalPadding*2)
  columnWidth: number     // px — exact column width
  fontSize: number
  lineHeight: number
  fontFamily: string
}
