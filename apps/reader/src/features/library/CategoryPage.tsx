import { Link, useParams } from 'react-router-dom'
import { SutraListCard } from '@/features/library/SutraListCard'
import { getCategoryBySlug } from '@/features/library/library.utils'
import { ErrorPage } from '@/shared/components/ErrorPage'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import { ROUTES } from '@/shared/constants/routes'

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>()
  const catalogQuery = useCatalogIndex()

  if (catalogQuery.isLoading) {
    return (
      <div className="space-y-2 p-4">
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
    <div className="pb-24">
      <header className="mb-4 border-b px-4 pb-4 pt-4" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mb-3 flex items-center gap-2">
          <Link
            to={ROUTES.LIBRARY}
            className="flex h-10 w-10 items-center justify-center rounded-full"
            aria-label="Quay lại thư viện"
          >
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{selectedCategory.displayName}</h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {selectedCategory.count} kinh sách
        </p>
      </header>

      <div className="space-y-3 px-4">
        {selectedCategory.books.map((book) => (
          <SutraListCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  )
}
