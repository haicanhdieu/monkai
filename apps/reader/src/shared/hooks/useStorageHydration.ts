import { useEffect } from 'react'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'
import { useReaderStore } from '@/stores/reader.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { useBookmarkCollapseStore } from '@/stores/bookmarkCollapse.store'
import type { UserSettings } from '@/stores/settings.store'
import type { Bookmark } from '@/stores/bookmarks.store'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Returns true for ids the reader can resolve back to a catalog book:
 * - catalog UUIDs (vbeta / vnthuquan books), and
 * - onedrive ids of the form `onedrive:<source>:<slug>` (which use colons, not the
 *   double-underscore SEO slugs the legacy filter was meant to reject).
 * Legacy SEO-slug bookIds (e.g. `vbeta__bo-trung-quan`) remain rejected.
 */
function isValidBookId(id: string): boolean {
  return UUID_RE.test(id) || id.startsWith('onedrive:')
}

export function useStorageHydration() {
  useEffect(() => {
    Promise.all([
      storageService.getItem<{
        bookId?: string
        cfi?: string
        bookTitle?: string
        page?: number
        total?: number
        chapterTitle?: string
        bookProgressApprox?: number
        source?: string
      }>(STORAGE_KEYS.LAST_READ_POSITION),
      storageService.getItem<UserSettings>(STORAGE_KEYS.USER_SETTINGS),
      storageService.getItem<Bookmark[]>(STORAGE_KEYS.BOOKMARKS),
      storageService.getItem<string[]>(STORAGE_KEYS.BOOKMARK_GROUP_STATE),
    ])
      .then(([lastRead, settings, bookmarks, collapseState]) => {
        // Only hydrate if the stored value has a cfi field (new CFI-based shape).
        // Items with the old page-based shape (no cfi field) are gracefully ignored.
        if (lastRead && lastRead.cfi && lastRead.bookId && isValidBookId(lastRead.bookId)) {
          useReaderStore.getState().setCurrentCfi(lastRead.cfi)
          useReaderStore.getState().hydrateLastRead(
            lastRead.bookId,
            lastRead.bookTitle ?? '',
            lastRead.page ?? 0,
            lastRead.total ?? 0,
            lastRead.chapterTitle,
            typeof lastRead.bookProgressApprox === 'number' && Number.isFinite(lastRead.bookProgressApprox)
              ? lastRead.bookProgressApprox
              : null,
            lastRead.source ?? '',
            lastRead.cfi ?? '',
          )
        }
        if (settings) useSettingsStore.getState().hydrate(settings)
        const validBookmarks = (bookmarks ?? [])
          .filter((b) => isValidBookId(b.bookId) && typeof b.cfi === 'string')
          .map((b) => ({
            ...b,
            type: (b as { type?: string }).type === 'manual' ? 'manual' : 'auto',
          } as Bookmark))
        if (validBookmarks.length > 0) {
          useBookmarksStore.getState().hydrate(validBookmarks)
        }
        // Reconcile persisted expanded-set against live bookIds (prune orphans whose
        // bookmarks were all deleted), hydrate the collapse store, and write back if changed.
        // Runs in the same Promise.all as bookmarks so groups never flash the wrong state.
        // Guard against a corrupted/legacy non-array value (mirrors the defensive bookmark
        // filtering above) — a bad shape must not throw and abort the whole hydration.
        const savedExpanded = Array.isArray(collapseState) ? collapseState : []
        const liveIds = new Set(validBookmarks.map((b) => b.bookId))
        const pruned = savedExpanded.filter((id) => liveIds.has(id))
        useBookmarkCollapseStore.getState().hydrate(pruned)
        if (pruned.length !== savedExpanded.length) {
          void storageService.setItem(STORAGE_KEYS.BOOKMARK_GROUP_STATE, pruned)
        }
      })
      .catch((err) => {
        console.error('[useStorageHydration] Failed to load persisted state:', err)
      })
  }, [])
}
