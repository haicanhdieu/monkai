import { useEffect } from 'react'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'
import { useReaderStore } from '@/stores/reader.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import type { UserSettings } from '@/stores/settings.store'
import type { Bookmark } from '@/stores/bookmarks.store'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns true for catalog UUIDs; false for legacy SEO-slug bookIds. */
function isValidBookId(id: string): boolean {
  return UUID_RE.test(id)
}

export function useStorageHydration() {
  useEffect(() => {
    Promise.all([
      storageService.getItem<{ bookId?: string; cfi?: string }>(STORAGE_KEYS.LAST_READ_POSITION),
      storageService.getItem<UserSettings>(STORAGE_KEYS.USER_SETTINGS),
      storageService.getItem<Bookmark[]>(STORAGE_KEYS.BOOKMARKS),
    ])
      .then(([lastRead, settings, bookmarks]) => {
        // Only hydrate if the stored value has a cfi field (new CFI-based shape).
        // Items with the old page-based shape (no cfi field) are gracefully ignored.
        if (lastRead && lastRead.cfi && lastRead.bookId && isValidBookId(lastRead.bookId)) {
          useReaderStore.getState().setCurrentCfi(lastRead.cfi)
        }
        if (settings) useSettingsStore.getState().hydrate(settings)
        if (bookmarks) {
          const validBookmarks = bookmarks.filter(
            (b) => isValidBookId(b.bookId) && typeof (b as { cfi?: string }).cfi === 'string'
          ) as Bookmark[]
          if (validBookmarks.length > 0) {
            useBookmarksStore.getState().hydrate(validBookmarks)
          }
        }
      })
      .catch((err) => {
        console.error('[useStorageHydration] Failed to load persisted state:', err)
      })
  }, [])
}
