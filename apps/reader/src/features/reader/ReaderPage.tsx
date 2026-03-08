import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useBook } from '@/shared/hooks/useBook'
import { useReaderStore } from '@/stores/reader.store'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { DataError } from '@/shared/services/data.service'
import type { DataErrorCategory } from '@/shared/types/global.types'
import ReaderErrorPage from './ReaderErrorPage'
import { ReaderEngine } from './ReaderEngine'
import { ChromelessLayout } from './ChromelessLayout'

export default function ReaderPage() {
  const { bookId = '' } = useParams<{ bookId: string }>()
  const { data: book, isLoading, error } = useBook(bookId)
  const { setBookId, setBookTitle, setPages } = useReaderStore()

  // Reset reader state only when the bookId changes — not on every query re-render (AC 4 of 3.2).
  // Depend on book?.id (primitive) so TanStack Query reference churn doesn't reset pages mid-read.
  // Do NOT reset currentPage here — it may already be hydrated from storage for resume.
  useEffect(() => {
    if (book) {
      setBookId(book.id)
      setBookTitle(book.title)
      setPages([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, setBookId, setBookTitle, setPages])

  if (!bookId) {
    return <ReaderErrorPage category="not_found" />
  }

  // Loading — skeleton while network/cache resolves (AC 2 of 3.2, AC 4 of 3.5)
  if (isLoading) {
    return (
      <div className="p-6" data-testid="reader-loading">
        <SkeletonText lines={14} />
      </div>
    )
  }

  // Error — map DataError category to user-safe copy (AC 5 of 3.2, AC 1-2 of 3.5)
  if (error || !book) {
    const category: DataErrorCategory =
      error instanceof DataError ? error.category : 'unknown'
    return <ReaderErrorPage category={category} />
  }

  // Success — chromeless reader with paginated engine (AC 1-4 of 3.2, all of 3.3-3.4)
  return (
    <ChromelessLayout book={book}>
      <ReaderEngine paragraphs={book.content} />
    </ChromelessLayout>
  )
}
