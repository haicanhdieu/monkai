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
export const EPUB_BLOB_CACHE_PREFIX = 'epub_blob_v3_'

export function epubBlobCacheKey(bookId: string): string {
  return `${EPUB_BLOB_CACHE_PREFIX}${bookId}`
}
