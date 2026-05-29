import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PersonIcon } from '@radix-ui/react-icons'
import { AppLogo } from '@/shared/components/AppLogo'
import { ROUTES, toRead } from '@/shared/constants/routes'
import { AppBar } from '@/shared/components/AppBar'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { BookCover } from '@/shared/components/BookCover'
import { SOURCES } from '@/shared/constants/sources'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'
import { BookmarkCard } from './BookmarkCard'
import { BookmarkSearchBar } from './BookmarkSearchBar'

export default function BookmarksPage() {
  const { bookmarks, removeBookmark } = useBookmarksStore()
  const [searchQuery, setSearchQuery] = useState('')
  const { data: vbetaCatalog } = useCatalogIndex('vbeta')
  const { data: vnthuquanCatalog } = useCatalogIndex('vnthuquan')

  const bookMap = useMemo(() => {
    const map: Record<string, { coverImageUrl: string | null; source: string; id: string; title: string }> = {}
    for (const catalog of [vbetaCatalog, vnthuquanCatalog]) {
      if (!catalog) continue
      for (const book of catalog.books) {
        if (import.meta.env.DEV && map[book.id] !== undefined) {
          console.warn(`[BookmarksPage] Duplicate book id across sources: ${book.id}`)
        }
        map[book.id] = {
          coverImageUrl: book.coverImageUrl,
          source: book.source,
          id: book.id,
          title: book.title,
        }
      }
    }
    return map
  }, [vbetaCatalog, vnthuquanCatalog])

  const groups = useMemo(() => Object.values(
    bookmarks.reduce<Record<string, { bookId: string; bookTitle: string; items: typeof bookmarks }>>(
      (acc, b) => {
        if (!acc[b.bookId]) acc[b.bookId] = { bookId: b.bookId, bookTitle: b.bookTitle, items: [] }
        acc[b.bookId].items.push(b)
        return acc
      },
      {}
    )
  )
    .sort((a, b) => {
      const maxA = a.items.reduce((m, i) => Math.max(m, i.timestamp), -Infinity)
      const maxB = b.items.reduce((m, i) => Math.max(m, i.timestamp), -Infinity)
      return maxB - maxA
    })
    .map((g) => {
      const sortedByTimestamp = [...g.items].sort((a, b) => b.timestamp - a.timestamp)
      return {
        ...g,
        // Most recently updated bookmark (manual save or auto last-read) — used by group header
        // so clicking the book cover/title opens the position the user cares about most.
        headerBookmark: sortedByTimestamp[0],
        items: sortedByTimestamp,
      }
    }), [bookmarks])

  // Reset search when all bookmarks are removed
  useEffect(() => {
    if (bookmarks.length === 0) setSearchQuery('')
  }, [bookmarks.length])

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const q = searchQuery.toLowerCase()
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (b) =>
            g.bookTitle.toLowerCase().includes(q) ||
            (b.chapterTitle?.toLowerCase().includes(q) ?? false)
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [groups, searchQuery])

  return (
    <div className="pb-24">
      <AppBar
        sticky
        title="Đánh Dấu"
        leftIcon={<AppLogo />}
        rightSlot={
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
          </span>
        }
      />
      <div className="px-6">
        {groups.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-6 px-8 py-20 text-center"
            data-testid="bookmarks-empty-state"
          >
            <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Chưa có dấu trang nào. Nhấn 🔖 khi đọc để lưu trang.
            </p>
            <Link
              to={ROUTES.LIBRARY}
              className="rounded-full px-6 py-3 text-sm font-semibold"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-on-error)' }}
            >
              Khám phá Thư Viện
            </Link>
          </div>
        ) : (
          <>
            <BookmarkSearchBar value={searchQuery} onChange={setSearchQuery} onClear={() => setSearchQuery('')} />
            <span className="sr-only" aria-live="polite" aria-atomic="true">
              {filteredGroups.length === 0
                ? 'Không có kết quả tìm kiếm'
                : `Đang hiển thị ${filteredGroups.length} nhóm dấu trang`}
            </span>
            {filteredGroups.length === 0 ? (
              <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Không tìm thấy dấu trang nào.
              </p>
            ) : (
              <div className="space-y-4">
                {filteredGroups.map((group) => (
                  <section
                    key={group.bookId}
                    data-testid="bookmark-group"
                    className="overflow-hidden rounded-2xl border"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                    }}
                  >
                    <Link
                      to={toRead(group.bookId)}
                      state={{ cfi: group.headerBookmark?.cfi, source: bookMap[group.bookId]?.source }}
                      aria-label={`Tiếp tục đọc ${group.bookTitle}`}
                      className="flex items-center gap-4 px-3 pt-3 pb-3 transition-colors hover:brightness-95"
                      data-testid="bookmark-group-header"
                    >
                      <div className="h-[88px] w-[70px] shrink-0 overflow-hidden rounded">
                        <BookCover
                          id={bookMap[group.bookId]?.id ?? group.bookId}
                          title={bookMap[group.bookId]?.title ?? group.bookTitle}
                          coverImageUrl={bookMap[group.bookId]?.coverImageUrl ?? null}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block text-base font-bold truncate" style={{ color: 'var(--color-text)' }}>
                          {group.bookTitle}
                        </span>
                        {(() => {
                          const src = bookMap[group.bookId]?.source
                          const cfg = src ? SOURCES.find((s) => s.id === src) : undefined
                          return cfg ? (
                            <span className={`mt-1 inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badgeClass}`}>
                              {cfg.label}
                            </span>
                          ) : null
                        })()}
                      </div>
                    </Link>
                    <ul className="divide-y divide-[var(--color-border)]">
                      {group.items.map((b) => (
                        <li key={`${b.bookId}-${b.cfi}-${b.type}`}>
                          <BookmarkCard
                            bookmark={b}
                            source={bookMap[group.bookId]?.source}
                            onDelete={() => {
                              removeBookmark(b.bookId, b.cfi)
                              void storageService.setItem(
                                STORAGE_KEYS.BOOKMARKS,
                                useBookmarksStore.getState().bookmarks
                              )
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
