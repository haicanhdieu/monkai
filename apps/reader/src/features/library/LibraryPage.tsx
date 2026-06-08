import { useState, useEffect, useRef } from 'react'
import { buildLibraryCategoryHeaders } from '@/features/library/library.utils'
import { useLibrarySearch } from '@/features/library/useLibrarySearch'
import { LibrarySearchBar } from '@/features/library/LibrarySearchBar'
import { CategoryGrid } from '@/features/library/CategoryGrid'
import { SearchResults } from '@/features/library/SearchResults'
import { SourceSelectorPill } from '@/features/library/SourceSelectorPill'
import { AppBar } from '@/shared/components/AppBar'
import { ErrorPage } from '@/shared/components/ErrorPage'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'
import { SOURCES } from '@/shared/constants/sources'
import { useActiveSource } from '@/shared/stores/useActiveSource'
import { DataError } from '@/shared/services/data.service'
import { PersonIcon } from '@radix-ui/react-icons'
import { AppLogo } from '@/shared/components/AppLogo'
import { useLibraryNavStore } from '@/stores/libraryNav.store'

const getMain = () => document.querySelector('main') as HTMLElement | null

export default function LibraryPage() {
  const { activeSource } = useActiveSource()
  const sourceConfig = SOURCES.find((s) => s.id === activeSource) ?? SOURCES[0]!
  const catalogQuery = useCatalogIndex(activeSource)
  const isOnline = useOnlineStatus()

  const { savedQuery, savedScrollTop, setSavedQuery, setSavedScrollTop, clear: clearNavState } = useLibraryNavStore()
  const [searchEnabled, setSearchEnabled] = useState(() => savedQuery.length > 0)
  const { query, setQuery, clearQuery, debouncedQuery, normalizedQuery, results } = useLibrarySearch(
    searchEnabled ? (catalogQuery.data?.books ?? []) : [],
    savedQuery,
  )
  // Incremented on popstate (Back/Forward) to trigger the restore effect when
  // React Router v7 keeps LibraryPage mounted and location.key never changes.
  const [navCount, setNavCount] = useState(0)

  const handleSetQuery = (q: string) => {
    setQuery(q)
    setSavedQuery(q)
  }

  const handleClearQuery = () => {
    clearQuery()
    clearNavState()
  }

  // Save scroll on link-click (pointerdown capture) before React Router v7's startTransition
  // defers the commit. LibraryPage stays mounted during the transition so cleanup effects
  // would fire too late (after the new route has already replaced <main> content).
  useEffect(() => {
    const main = getMain()
    if (!main) return
    const saveScroll = (e: PointerEvent) => {
      if ((e.target as Element)?.closest('a[href]')) {
        setSavedScrollTop(main.scrollTop)
      }
    }
    main.addEventListener('pointerdown', saveScroll, { capture: true, passive: true })
    return () => main.removeEventListener('pointerdown', saveScroll, { capture: true })
  }, [setSavedScrollTop])

  // Detect Back/Forward navigation. React Router v7 keeps LibraryPage mounted via
  // startTransition, so location.key never updates inside this component.
  // popstate fires for Back/Forward (not pushState), which is exactly the trigger we need.
  const scrollRestoredRef = useRef(false)
  useEffect(() => {
    const handlePopState = () => {
      // Reset guard synchronously before the state update so the restore effect
      // sees scrollRestoredRef.current = false when it fires on the next render.
      scrollRestoredRef.current = false
      setNavCount((n) => n + 1)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Restore scroll once per navigation — fires on mount and after each Back/Forward.
  useEffect(() => {
    if (savedScrollTop > 0 && normalizedQuery && results.length > 0 && !scrollRestoredRef.current) {
      scrollRestoredRef.current = true
      requestAnimationFrame(() => {
        getMain()?.scrollTo({ top: savedScrollTop })
      })
    }
  }, [normalizedQuery, results.length, savedScrollTop, navCount])

  const rightSlot = (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full border"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
    </span>
  )

  if (catalogQuery.isLoading) {
    return (
      <div className="pb-24">
        <AppBar sticky title="Thư Viện" leftIcon={<AppLogo />} rightSlot={rightSlot}>
          <LibrarySearchBar query={query} onQueryChange={handleSetQuery} onClear={handleClearQuery} onFocus={() => setSearchEnabled(true)} placeholder={sourceConfig.searchPlaceholder} />
          <div className="pb-2 pt-1">
            <SourceSelectorPill onSourceChange={() => { handleClearQuery(); setSearchEnabled(false) }} />
          </div>
        </AppBar>
        <div className="px-4">
          <div className="mb-6" />

          <div className="mb-6 rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
            <SkeletonText lines={1} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" data-testid="library-skeleton-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border p-4"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
        </div>
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
      <div className="pb-24">
        <AppBar sticky title="Thư Viện" leftIcon={<AppLogo />} rightSlot={rightSlot}>
          <LibrarySearchBar query={query} onQueryChange={handleSetQuery} onClear={handleClearQuery} onFocus={() => setSearchEnabled(true)} placeholder={sourceConfig.searchPlaceholder} />
          <div className="pb-2 pt-1">
            <SourceSelectorPill onSourceChange={() => { handleClearQuery(); setSearchEnabled(false) }} />
          </div>
        </AppBar>
        <div className="px-4">
          <div className="mb-4" />
          {showOfflineMessage ? (
            <ErrorPage
              title={OFFLINE_COPY.catalogOfflineTitle}
              description={OFFLINE_COPY.catalogOfflineDescription}
            />
          ) : (
            <ErrorPage />
          )}
        </div>
      </div>
    )
  }

  const categories = buildLibraryCategoryHeaders(catalogQuery.data)

  return (
    <div className="pb-24">
      <AppBar
        title="Thư Viện"
        sticky
        leftIcon={<AppLogo />}
        rightSlot={rightSlot}
      >
        <LibrarySearchBar query={query} onQueryChange={handleSetQuery} onClear={handleClearQuery} onFocus={() => setSearchEnabled(true)} placeholder={sourceConfig.searchPlaceholder} />
        <div className="pb-2 pt-1">
          <SourceSelectorPill onSourceChange={() => { handleClearQuery(); setSearchEnabled(false) }} />
        </div>
      </AppBar>

      <div className="px-4 pt-5">
        {normalizedQuery ? (
          <>
            <p
              className="mb-3 px-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--color-accent)' }}
            >
              Kết quả tìm kiếm
            </p>
            <SearchResults query={debouncedQuery} results={results} />
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Danh mục</h2>
              <span className="text-sm font-medium text-[var(--color-accent)]">{categories.length} nhóm</span>
            </div>
            <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {sourceConfig.subtitle}
            </p>
            <CategoryGrid categories={categories} countSuffix={sourceConfig.countSuffix} />
          </>
        )}
      </div>
    </div>
  )
}
