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
  const { setBookId, setBookTitle, setPages, setPageBoundaries } = useReaderStore()

  // Reset reader state when book data or bookId (URL param / catalog UUID) changes.
  // Do NOT reset currentPage here — it may already be hydrated from storage for resume.
  useEffect(() => {
    if (book) {
      setBookId(bookId)
      setBookTitle(book.title)
      setPages([])
      setPageBoundaries([0])
    }
  }, [book, bookId, setBookId, setBookTitle, setPages, setPageBoundaries])

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
    return <ReaderErrorPage category={category} />
  }

  return (
    <ChromelessLayout book={book}>
      <ReaderEngine paragraphs={book.content} />
    </ChromelessLayout>
  )
}
