import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SutraListCard } from '@/features/library/SutraListCard'
import type { LibraryCategory } from '@/features/library/library.types'
import { getCategoryBySlug } from '@/features/library/library.utils'
import { useLibrarySearch } from '@/features/library/useLibrarySearch'
import { LibrarySearchBar } from '@/features/library/LibrarySearchBar'
import { SearchResults } from '@/features/library/SearchResults'
import { AppBar } from '@/shared/components/AppBar'
import { ErrorPage } from '@/shared/components/ErrorPage'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { useActiveSource } from '@/shared/stores/useActiveSource'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import { DataError } from '@/shared/services/data.service'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'
import { ROUTES } from '@/shared/constants/routes'

const SCROLL_KEY = (slug: string) => `category_scroll_${slug}`

const getMain = () => document.querySelector('main') as HTMLElement | null

function VirtualBookList({ books, categorySlug }: { books: LibraryCategory['books']; categorySlug: string }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const storageKey = SCROLL_KEY(categorySlug)
  const savedOffset = useRef(Number(sessionStorage.getItem(storageKey) ?? '0'))
  // Track scrollTop in a ref — main.scrollTop is still valid in useEffect cleanup
  // unlike a detached inner container, because main stays mounted throughout the app lifetime
  const scrollTopRef = useRef(savedOffset.current)

  // scrollMargin = distance from the top of <main> to the top of this list (AppBar height).
  // The virtualizer needs this to correctly compute which items are in the visible range.
  const [scrollMargin, setScrollMargin] = useState(0)

  const virtualizer = useVirtualizer({
    count: books.length,
    getScrollElement: getMain,
    estimateSize: () => 108, // card min-h ~96px + gap 12px
    overscan: 5,
    scrollMargin,
  })

  // Measure the list's top offset from <main> once after the AppBar has painted.
  // At mount time main.scrollTop=0, so getBoundingClientRect gives the true in-flow offset.
  useLayoutEffect(() => {
    const main = getMain()
    const el = parentRef.current
    if (!main || !el) return
    setScrollMargin(el.getBoundingClientRect().top - main.getBoundingClientRect().top)
  }, [])

  // Restore scroll position on mount (after measuring scrollMargin)
  useLayoutEffect(() => {
    const main = getMain()
    if (main && savedOffset.current > 0) main.scrollTop = savedOffset.current
  }, [])

  // Keep scrollTopRef in sync via <main>'s scroll event
  useEffect(() => {
    const main = getMain()
    if (!main) return
    const onScroll = () => { scrollTopRef.current = main.scrollTop }
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  // Save to sessionStorage on unmount
  useEffect(() => {
    return () => sessionStorage.setItem(storageKey, String(scrollTopRef.current))
  }, [storageKey])

  return (
    <div ref={parentRef} className="px-4">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
              paddingBottom: '12px',
            }}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
          >
            <SutraListCard book={books[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>()
  const { activeSource } = useActiveSource()
  const catalogQuery = useCatalogIndex(activeSource)
  const isOnline = useOnlineStatus()

  // Hoist before all early-return guards to satisfy React hook rules
  const selectedCategory = catalogQuery.data && category
    ? getCategoryBySlug(catalogQuery.data, category) ?? null
    : null

  const { query, setQuery, clearQuery, debouncedQuery, normalizedQuery, results } =
    useLibrarySearch(selectedCategory?.books ?? [])

  if (catalogQuery.isLoading) {
    return (
      <div className="space-y-2 p-4">
        <SkeletonText lines={1} className="max-w-40" />
        <SkeletonText lines={6} />
      </div>
    )
  }

  if (catalogQuery.error || !catalogQuery.data) {
    const isOffline = !isOnline
    const showOfflineMessage =
      catalogQuery.error instanceof DataError &&
      catalogQuery.error.category === 'network' &&
      isOffline
    return (
      <div className="p-4">
        {showOfflineMessage ? (
          <ErrorPage
            title={OFFLINE_COPY.catalogOfflineTitle}
            description={OFFLINE_COPY.catalogOfflineDescription}
          />
        ) : (
          <ErrorPage />
        )}
      </div>
    )
  }

  if (!category) {
    return (
      <div className="p-4">
        <ErrorPage
          title="Không tìm thấy thể loại"
          description="Đường dẫn không hợp lệ hoặc danh mục chưa có dữ liệu."
        />
      </div>
    )
  }

  if (!selectedCategory) {
    return (
      <div className="p-4">
        <ErrorPage
          title="Không tìm thấy thể loại"
          description="Đường dẫn không hợp lệ hoặc danh mục chưa có dữ liệu."
        />
      </div>
    )
  }

  return (
    <div className="pb-24">
      <AppBar
        sticky
        title={selectedCategory.displayName}
        backTo={ROUTES.LIBRARY}
        rightSlot={
          <span className="text-sm font-medium text-[var(--color-accent)]">
            {selectedCategory.count} kinh sách
          </span>
        }
      >
        <LibrarySearchBar query={query} onQueryChange={setQuery} onClear={clearQuery} />
      </AppBar>

      {normalizedQuery ? (
        <div className="px-4 pt-2">
          <SearchResults query={debouncedQuery} results={results} />
        </div>
      ) : (
        <VirtualBookList books={selectedCategory.books} categorySlug={category} />
      )}
    </div>
  )
}
