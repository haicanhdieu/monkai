import { useEffect } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useBook } from '@/shared/hooks/useBook'
import { useReaderStore } from '@/stores/reader.store'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import { SkeletonText } from '@/shared/components/SkeletonText'
import { DataError } from '@/shared/services/data.service'
import type { DataErrorCategory } from '@/shared/types/global.types'
import ReaderErrorPage from './ReaderErrorPage'
import { ReaderEngine } from './ReaderEngine'
import { ChromelessLayout } from './ChromelessLayout'
import { useEpubFromBook } from './useEpubFromBook'
import { useEpubReader } from './useEpubReader'

export default function ReaderPage() {
  const { bookId = '' } = useParams<{ bookId: string }>()
  const location = useLocation()

  // Clear stale chapter/page context immediately when navigating to a different book.
  // Without this, currentChapterTitle (and page counts) from the previous book remain
  // visible in the bottom bar until the first 'relocated' event fires on the new book.
  useEffect(() => {
    useReaderStore.getState().setProgress(0, 0, '')
  }, [bookId])
  const { data: book, isLoading, error } = useBook(bookId)
  const { data: catalog } = useCatalogIndex()
  const isOnline = useOnlineStatus()

  const catalogBook = catalog?.books.find((b) => b.id === bookId)
  const epubUrlFromCatalog = catalogBook?.epubUrl ?? null
  const initialCfi = (location.state as { cfi?: string } | null)?.cfi ?? null

  // When catalog has no epubUrl, build EPUB from JSON in memory and cache in browser storage
  const { epubUrl: epubUrlFromBook, isLoading: epubFromBookLoading, error: epubFromBookError } =
    useEpubFromBook(epubUrlFromCatalog ? null : book ?? null)

  const epubUrl = epubUrlFromCatalog ?? epubUrlFromBook
  const { containerRef, rendition, book: epubBook, isReady, error: readerError, getToc, navigateToTocEntry } =
    useEpubReader(epubUrl)

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

  if (!epubUrlFromCatalog && epubFromBookLoading) {
    return (
      <div className="p-6" data-testid="reader-loading">
        <SkeletonText lines={14} />
      </div>
    )
  }

  if (!epubUrlFromCatalog && epubFromBookError) {
    return <ReaderErrorPage category="parse" />
  }

  if (!epubUrl || readerError) {
    return <ReaderErrorPage category="parse" />
  }

  return (
    <ChromelessLayout
      book={book}
      hasCoverPage={false}
      isReady={isReady}
      getToc={getToc}
      navigateToTocEntry={navigateToTocEntry}
    >
      <ReaderEngine
        containerRef={containerRef}
        rendition={rendition}
        book={epubBook}
        isReady={isReady}
        error={readerError}
        bookId={bookId}
        bookTitle={book.title}
        initialCfi={initialCfi}
      />
    </ChromelessLayout>
  )
}
