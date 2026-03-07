import { LibrarySearchHub } from '@/features/library/LibrarySearchHub'
import { buildLibraryCategories } from '@/features/library/library.utils'
import { ErrorPage } from '@/shared/components/ErrorPage'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'

export default function LibraryPage() {
  const catalogQuery = useCatalogIndex()

  if (catalogQuery.isLoading) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-2xl font-semibold">Thư viện</h1>
        <div className="grid gap-3 sm:grid-cols-2" data-testid="library-skeleton-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-xl border p-4 min-h-[88px]"
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
    return (
      <div className="p-4">
        <h1 className="mb-4 text-2xl font-semibold">Thư viện</h1>
        <ErrorPage />
      </div>
    )
  }

  const categories = buildLibraryCategories(catalogQuery.data)

  return (
    <div className="p-4 pb-20">
      <h1 className="mb-2 text-2xl font-semibold">Thư viện</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Khám phá theo thể loại hoặc tìm nhanh bằng từ khóa.
      </p>
      <LibrarySearchHub categories={categories} books={catalogQuery.data.books} />
    </div>
  )
}
