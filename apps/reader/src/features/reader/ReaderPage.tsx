import { useParams, useLocation } from 'react-router-dom'
import { useBook } from '@/shared/hooks/useBook'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { DataError } from '@/shared/services/data.service'
import type { DataErrorCategory } from '@/shared/types/global.types'
import ReaderErrorPage from './ReaderErrorPage'
import { ReaderEngine } from './ReaderEngine'
import { ChromelessLayout } from './ChromelessLayout'

export default function ReaderPage() {
  const { bookId = '' } = useParams<{ bookId: string }>()
  const location = useLocation()
  const { data: book, isLoading, error } = useBook(bookId)
  const { data: catalog } = useCatalogIndex()
  const isOnline = useOnlineStatus()

  const catalogBook = catalog?.books.find((b) => b.id === bookId)
  const epubUrl = catalogBook?.epubUrl ?? null
  const initialCfi = (location.state as { cfi?: string } | null)?.cfi ?? null

  if (!bookId) {
    return <ReaderErrorPage category="not_found" />
  }

  if (isLoading) {
    return (
      <div className="p-6" data-testid="reader-loading">
        <SkeletonText lines={14} />
      </div>
    )
  }

  if (error || !book) {
    const category: DataErrorCategory =
      error instanceof DataError ? error.category : 'unknown'
    return <ReaderErrorPage category={category} isOffline={!isOnline} />
  }

  if (!epubUrl) {
    return <ReaderErrorPage category="parse" />
  }

  return (
    <ChromelessLayout book={book} hasCoverPage={false}>
      <ReaderEngine
        epubUrl={epubUrl}
        bookId={bookId}
        bookTitle={book.title}
        initialCfi={initialCfi}
      />
    </ChromelessLayout>
  )
}
