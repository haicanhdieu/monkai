import { LibrarySearchHub } from '@/features/library/LibrarySearchHub'
import { buildLibraryCategories } from '@/features/library/library.utils'
import { AppBar } from '@/shared/components/AppBar'
import { ErrorPage } from '@/shared/components/ErrorPage'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'
import { DataError } from '@/shared/services/data.service'
import { PersonIcon } from '@radix-ui/react-icons'
import { AppLogo } from '@/shared/components/AppLogo'

export default function LibraryPage() {
  const catalogQuery = useCatalogIndex()
  const isOnline = useOnlineStatus()

  if (catalogQuery.isLoading) {
    return (
      <div className="pb-24">
        <AppBar
          title="Thư Viện"
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
        <div className="px-4">
          <div className="mb-6" />

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
        <AppBar
          title="Thư Viện"
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

  const categories = buildLibraryCategories(catalogQuery.data)

  return (
    <div className="pb-24">
      <AppBar
        title="Thư Viện"
        sticky
        leftIcon={<AppLogo />}
        rightSlot={
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
          </span>
        }
      >
        <LibrarySearchHub categories={categories} books={catalogQuery.data.books} contentClassName="pt-5" />
      </AppBar>

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
