import { useEffect } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useBook } from '@/shared/hooks/useBook'
import { useReaderStore } from '@/stores/reader.store'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { DataError } from '@/shared/services/data.service'
import type { DataErrorCategory } from '@/shared/types/global.types'
import ReaderErrorPage from './ReaderErrorPage'
import { ReaderEngine } from './ReaderEngine'
import { ChromelessLayout } from './ChromelessLayout'

export default function ReaderPage() {
  const { bookId = '' } = useParams<{ bookId: string }>()
  const { state: locationState } = useLocation() as { state?: { page?: number } }
  const { data: book, isLoading, error } = useBook(bookId)
  const { setBookId, setBookTitle, setPages, setPageBoundaries, setCurrentPage } = useReaderStore()

  const pageFromBookmark =
    locationState?.page != null && typeof locationState.page === 'number' ? locationState.page : null

  // Reset reader state when book data or bookId (URL param / catalog UUID) changes.
  // If opening from a bookmark link, use that page; otherwise set 0 so we don't show the previous book's page.
  useEffect(() => {
    if (book) {
      setBookId(bookId)
      setBookTitle(book.title)
      setPages([])
      setPageBoundaries([0])
      setCurrentPage(pageFromBookmark ?? 0)
    }
  }, [book, bookId, pageFromBookmark, setBookId, setBookTitle, setPages, setPageBoundaries, setCurrentPage])

  // Set currentPage to this book's last position or 0 when opening a book (avoids reusing
  // the previous book's page). Skip when page came from a bookmark link.
  useEffect(() => {
    if (!bookId || !book || pageFromBookmark !== null) return
    let cancelled = false
    storageService
      .getItem<{ bookId: string; page: number }>(STORAGE_KEYS.LAST_READ_POSITION)
      .then((lastRead) => {
        if (cancelled) return
        if (lastRead && lastRead.bookId === bookId) {
          setCurrentPage(lastRead.page)
        } else {
          setCurrentPage(0)
        }
      })
      .catch(() => {
        if (!cancelled) setCurrentPage(0)
      })
    return () => {
      cancelled = true
    }
  }, [bookId, book, pageFromBookmark, setCurrentPage])

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
    <ChromelessLayout book={book} hasCoverPage>
      <ReaderEngine
        paragraphs={book.content}
        coverImageUrl={book.coverImageUrl ?? null}
        bookTitle={book.title}
      />
    </ChromelessLayout>
  )
}
