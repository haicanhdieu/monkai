import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PersonIcon, ChevronDownIcon } from '@radix-ui/react-icons'
import { AppLogo } from '@/shared/components/AppLogo'
import { ROUTES, toRead } from '@/shared/constants/routes'
import { AppBar } from '@/shared/components/AppBar'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { useBookmarkCollapseStore } from '@/stores/bookmarkCollapse.store'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { BookCover } from '@/shared/components/BookCover'
import { SOURCES } from '@/shared/constants/sources'
import type { SourceId } from '@/shared/constants/sources'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'
import { BookmarkCard } from './BookmarkCard'
import { BookmarkSearchBar } from './BookmarkSearchBar'

export default function BookmarksPage() {
  const { bookmarks, removeBookmark } = useBookmarksStore()
  // Subscribe to the raw array (NOT isExpanded via getState) so toggles re-render.
  const expandedBookIds = useBookmarkCollapseStore((s) => s.expandedBookIds)
  const toggleGroup = useBookmarkCollapseStore((s) => s.toggle)
  const [searchQuery, setSearchQuery] = useState('')
  const { data: vbetaCatalog } = useCatalogIndex('vbeta')
  const { data: vnthuquanCatalog } = useCatalogIndex('vnthuquan')

  const bookMap = useMemo(() => {
    const map: Record<string, { coverImageUrl: string | null; source: string; id: string; title: string }> = {}
    // Pair each catalog with its bucket source id. The reader resolves books by bucket
    // ('vbeta' | 'vnthuquan'), not by the book's underlying data-source. Onedrive books
    // live in the vnthuquan bucket but carry source='onedrive'; passing that to the reader
    // fails (getCatalog has no 'onedrive' bucket), so we record the bucket id here instead.
    const buckets: Array<[SourceId, typeof vbetaCatalog]> = [
      ['vbeta', vbetaCatalog],
      ['vnthuquan', vnthuquanCatalog],
    ]
    for (const [bucketSource, catalog] of buckets) {
      if (!catalog) continue
      for (const book of catalog.books) {
        if (import.meta.env.DEV && map[book.id] !== undefined) {
          console.warn(`[BookmarksPage] Duplicate book id across sources: ${book.id}`)
        }
        map[book.id] = {
          coverImageUrl: book.coverImageUrl,
          source: bucketSource,
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

  const searchActive = searchQuery.trim() !== ''

  // Original (unfiltered) item count per book — used for the `matches/total` badge under search.
  const totalByBookId = useMemo(() => {
    const m: Record<string, number> = {}
    for (const g of groups) m[g.bookId] = g.items.length
    return m
  }, [groups])

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
                {filteredGroups.map((group) => {
                  // Effective expansion: search force-expands matching groups (a rendered group
                  // under search always has a match); otherwise the persisted store state decides.
                  // The toggle is inert while searching (see button `disabled` below), so the
                  // store is never written during search and clearing the query restores it.
                  const expanded = searchActive ? true : expandedBookIds.includes(group.bookId)
                  const panelId = `bookmark-panel-${group.bookId}`
                  const total = totalByBookId[group.bookId] ?? group.items.length
                  const countLabel = searchActive ? `${group.items.length}/${total}` : `${total}`
                  const otherCount = total - 1
                  const chapterLabel = group.headerBookmark?.chapterTitle ?? 'Vị trí đã lưu'
                  return (
                    <section
                      key={group.bookId}
                      data-testid="bookmark-group"
                      className="overflow-hidden rounded-2xl border"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      <div className="flex items-stretch">
                        <Link
                          to={toRead(group.bookId)}
                          state={{ cfi: group.headerBookmark?.cfi, source: bookMap[group.bookId]?.source }}
                          aria-label={`Tiếp tục đọc ${group.bookTitle}`}
                          className="flex min-w-0 flex-1 items-center gap-4 px-3 pt-3 pb-3 transition-colors hover:brightness-95"
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
                            <span className="flex items-center gap-2">
                              <span className="block text-base font-bold truncate" style={{ color: 'var(--color-text)' }}>
                                {group.bookTitle}
                              </span>
                              <span
                                data-testid="bookmark-group-count"
                                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                              >
                                {countLabel}
                              </span>
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
                            {!expanded && (
                              <span
                                data-testid="bookmark-group-summary"
                                className="mt-1 block truncate text-sm"
                                style={{ color: 'var(--color-text-muted)' }}
                              >
                                Đang đọc: {chapterLabel}
                                {otherCount > 0 ? ` · ${otherCount} dấu khác` : ''}
                              </span>
                            )}
                          </div>
                        </Link>
                        <button
                          type="button"
                          data-testid="bookmark-group-toggle"
                          aria-expanded={expanded}
                          aria-controls={expanded ? panelId : undefined}
                          aria-label={`${expanded ? 'Thu gọn' : 'Mở rộng'} ${group.bookTitle}`}
                          // Inert during search: the group is force-expanded, so toggling would
                          // silently mutate persisted state with no visible effect. Keeps the
                          // "store is never written during search" invariant true.
                          disabled={searchActive}
                          onClick={() => toggleGroup(group.bookId)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center self-center text-[var(--color-text-muted)] transition-colors hover:brightness-95 disabled:cursor-default disabled:opacity-50"
                        >
                          <ChevronDownIcon
                            className={`h-5 w-5 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      {expanded && (
                        <ul id={panelId} className="divide-y divide-[var(--color-border)]">
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
                      )}
                    </section>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
