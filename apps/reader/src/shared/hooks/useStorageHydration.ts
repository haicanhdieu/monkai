import { useEffect } from 'react'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'
import { useReaderStore } from '@/stores/reader.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import type { UserSettings } from '@/stores/settings.store'
import type { Bookmark } from '@/stores/bookmarks.store'
import type { LastReadPosition } from '@/stores/reader.store'

export function useStorageHydration() {
  useEffect(() => {
    Promise.all([
      storageService.getItem<LastReadPosition>(STORAGE_KEYS.LAST_READ_POSITION),
      storageService.getItem<UserSettings>(STORAGE_KEYS.USER_SETTINGS),
      storageService.getItem<Bookmark[]>(STORAGE_KEYS.BOOKMARKS),
    ])
      .then(([lastRead, settings, bookmarks]) => {
        if (lastRead) useReaderStore.getState().hydrate(lastRead)
        if (settings) useSettingsStore.getState().hydrate(settings)
        if (bookmarks) useBookmarksStore.getState().hydrate(bookmarks)
      })
      .catch((err) => {
        console.error('[useStorageHydration] Failed to load persisted state:', err)
      })
  }, [])
}
