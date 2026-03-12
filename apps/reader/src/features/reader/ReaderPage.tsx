import { useParams } from 'react-router-dom'
import { useBook } from '@/shared/hooks/useBook'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { DataError } from '@/shared/services/data.service'
import type { DataErrorCategory } from '@/shared/types/global.types'
import ReaderErrorPage from './ReaderErrorPage'
import { ReaderEngine } from './ReaderEngine'
import { ChromelessLayout } from './ChromelessLayout'

// TODO: epub.js rewrite in Story 2.2
// ReaderPage previously used useReaderStore to set bookId, bookTitle, pages,
// pageBoundaries, and currentPage (including bookmark page restore from storage).
// These are removed as part of the reader.store CFI migration (Story 3.1).
// The full ReaderPage rewrite with epub.js loading and CFI-based navigation
// is implemented in Story 2.2.

export default function ReaderPage() {
  const { bookId = '' } = useParams<{ bookId: string }>()
  const { data: book, isLoading, error } = useBook(bookId)
  const isOnline = useOnlineStatus()

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

  return (
    <ChromelessLayout book={book} hasCoverPage>
      <ReaderEngine
        paragraphs={book.content}
        coverImageUrl={book.coverImageUrl ?? null}
        bookTitle={book.title}
      />
    </ChromelessLayout>
  )
}
