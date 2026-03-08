import { useEffect } from 'react'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'
import { useReaderStore } from '@/stores/reader.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import type { UserSettings } from '@/stores/settings.store'
import type { Bookmark } from '@/stores/bookmarks.store'
import type { LastReadPosition } from '@/stores/reader.store'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns true for catalog UUIDs; false for legacy SEO-slug bookIds. */
function isValidBookId(id: string): boolean {
  return UUID_RE.test(id)
}

export function useStorageHydration() {
  useEffect(() => {
    Promise.all([
      storageService.getItem<LastReadPosition>(STORAGE_KEYS.LAST_READ_POSITION),
      storageService.getItem<UserSettings>(STORAGE_KEYS.USER_SETTINGS),
      storageService.getItem<Bookmark[]>(STORAGE_KEYS.BOOKMARKS),
    ])
      .then(([lastRead, settings, bookmarks]) => {
        // Guard against legacy entries persisted before the UUID fix.
        // Non-UUID bookIds (e.g. SEO slugs like "vbeta__bo-trung-quan") cannot be
        // looked up via the catalog and would produce broken navigation links.
        if (lastRead && isValidBookId(lastRead.bookId)) {
          useReaderStore.getState().hydrate(lastRead)
        }
        if (settings) useSettingsStore.getState().hydrate(settings)
        if (bookmarks) {
          const validBookmarks = bookmarks.filter((b) => isValidBookId(b.bookId))
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
