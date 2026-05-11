export const STORAGE_KEYS = {
  /** Value shape: { bookId: string, cfi: string } — epub.js CFI string for current location */
  LAST_READ_POSITION: 'last_read_position',
  USER_SETTINGS: 'user_settings',
  BOOKMARKS: 'bookmarks',
} as const

/** Prefix for cached EPUB blobs (JSON books converted in-memory). Key: epubBlobKey(bookId)
 * Bump the version suffix when the EPUB generation logic changes in a way that might
 * fix previously broken blobs, so that stale blobs don't mask fixes.
 */
export const EPUB_BLOB_CACHE_PREFIX = 'epub_blob_v4_'

export function epubBlobCacheKey(bookId: string): string {
  return `${EPUB_BLOB_CACHE_PREFIX}${bookId}`
}

export const CATALOG_CACHE_PREFIX = 'catalog_cache_v1_'

export function catalogCacheKey(source: string): string {
  return `${CATALOG_CACHE_PREFIX}${source}`
}

export const BOOK_CACHE_PREFIX = 'book_cache_v1_'

export function bookCacheKey(id: string, source: string): string {
  return `${BOOK_CACHE_PREFIX}${source}_${id}`
}
