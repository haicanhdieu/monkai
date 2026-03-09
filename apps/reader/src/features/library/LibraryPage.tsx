import { LibrarySearchHub } from '@/features/library/LibrarySearchHub'
import { buildLibraryCategories } from '@/features/library/library.utils'
import { ErrorPage } from '@/shared/components/ErrorPage'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'
import { DataError } from '@/shared/services/data.service'
import { HamburgerMenuIcon, PersonIcon } from '@radix-ui/react-icons'

export default function LibraryPage() {
  const catalogQuery = useCatalogIndex()
  const isOnline = useOnlineStatus()

  if (catalogQuery.isLoading) {
    return (
      <div className="px-4 pb-24 pt-4">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full" aria-hidden="true">
              <HamburgerMenuIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-bold tracking-tight">Thư Viện</h1>
          </div>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--color-border)' }}
            aria-hidden="true"
          >
            <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
          </span>
        </header>

        <div className="mb-6 rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
          <SkeletonText lines={1} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2" data-testid="library-skeleton-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border p-4 min-h-[128px]"
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
    )
  }

  if (catalogQuery.error || !catalogQuery.data) {
    const isOffline = !isOnline
    const showOfflineMessage =
      catalogQuery.error instanceof DataError &&
      catalogQuery.error.category === 'network' &&
      isOffline
    return (
      <div className="px-4 pb-24 pt-4">
        <h1 className="mb-4 text-xl font-bold tracking-tight">Thư Viện</h1>
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

  const categories = buildLibraryCategories(catalogQuery.data)

  return (
    <div className="pb-24">
      <header
        className="sticky top-0 z-20 border-b px-4 pb-3 pt-4 backdrop-blur"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-background)',
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full" aria-hidden="true">
              <HamburgerMenuIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-bold tracking-tight">Thư Viện</h1>
          </div>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--color-border)' }}
            aria-hidden="true"
          >
            <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
          </span>
        </div>
        <LibrarySearchHub categories={categories} books={catalogQuery.data.books} contentClassName="pt-5" />
      </header>

      <section className="px-4 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Danh mục</h2>
          <span className="text-sm font-medium text-[var(--color-accent)]">{categories.length} nhóm</span>
        </div>
        <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Khám phá theo thể loại hoặc tìm nhanh bằng từ khóa.
        </p>
      </section>
    </div>
  )
}
