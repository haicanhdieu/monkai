export const STORAGE_KEYS = {
  /** Value shape: { bookId: string, cfi: string } — epub.js CFI string for current location */
  LAST_READ_POSITION: 'last_read_position',
  USER_SETTINGS: 'user_settings',
  BOOKMARKS: 'bookmarks',
} as const
