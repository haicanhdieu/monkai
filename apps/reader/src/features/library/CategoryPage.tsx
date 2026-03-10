import { useParams } from 'react-router-dom'
import { SutraListCard } from '@/features/library/SutraListCard'
import { getCategoryBySlug } from '@/features/library/library.utils'
import { AppBar } from '@/shared/components/AppBar'
import { ErrorPage } from '@/shared/components/ErrorPage'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import { DataError } from '@/shared/services/data.service'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'
import { ROUTES } from '@/shared/constants/routes'

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>()
  const catalogQuery = useCatalogIndex()
  const isOnline = useOnlineStatus()

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

  const selectedCategory = getCategoryBySlug(catalogQuery.data, category)
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
        title={selectedCategory.displayName}
        backTo={ROUTES.LIBRARY}
      >
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {selectedCategory.count} kinh sách
        </p>
      </AppBar>

      <div className="space-y-3 px-4">
        {selectedCategory.books.map((book) => (
          <SutraListCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  )
}
