import { useParams } from 'react-router-dom'
import { SutraListCard } from '@/features/library/SutraListCard'
import { getCategoryBySlug } from '@/features/library/library.utils'
import { ErrorPage } from '@/shared/components/ErrorPage'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>()
  const catalogQuery = useCatalogIndex()

  if (catalogQuery.isLoading) {
    return (
      <div className="p-4 space-y-2">
        <SkeletonText lines={1} className="max-w-40" />
        <SkeletonText lines={6} />
      </div>
    )
  }

  if (catalogQuery.error || !catalogQuery.data || !category) {
    return (
      <div className="p-4">
        <ErrorPage />
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
    <div className="p-4 pb-20">
      <h1 className="text-2xl font-semibold">{selectedCategory.displayName}</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {selectedCategory.count} kinh sách
      </p>

      <div className="space-y-2">
        {selectedCategory.books.map((book) => (
          <SutraListCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  )
}
