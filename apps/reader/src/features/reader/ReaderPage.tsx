import { useEffect } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useBook } from '@/shared/hooks/useBook'
import { useReaderStore } from '@/stores/reader.store'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { useActiveSource } from '@/shared/stores/useActiveSource'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
import type { SourceId } from '@/shared/constants/sources'
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
  const { activeSource } = useActiveSource()
  // Use source passed via navigation state (e.g. from bookmarks) so the correct
  // catalog is queried even when activeSource differs from the book's actual source.
  const locationSource = (location.state as { source?: SourceId } | null)?.source
  const { data: book, isLoading, error } = useBook(bookId, locationSource)
  // Prefer the book's own source once loaded; fall back to locationSource or activeSource.
  const catalogSource = (book?.source as SourceId | undefined) ?? locationSource ?? activeSource
  const { data: catalog, isLoading: catalogIsLoading } = useCatalogIndex(catalogSource)
  const isOnline = useOnlineStatus()

  const catalogBook = catalog?.books.find((b) => b.id === bookId)
  const epubUrlFromCatalog = catalogBook?.epubUrl ?? null
  const initialCfi = (location.state as { cfi?: string } | null)?.cfi ?? null

  // Wait for catalog before deciding whether to build epub from JSON. Starting the
  // JSON build before catalog loads creates an empty epub for onedrive books (which
  // have no content field) — epub.js display() then hangs on the empty epub.
  const bookForEpubBuild = catalogIsLoading ? null : (epubUrlFromCatalog ? null : book ?? null)
  const { epubUrl: epubUrlFromBook, isLoading: epubFromBookLoading, error: epubFromBookError } =
    useEpubFromBook(bookForEpubBuild)

  const epubUrl = epubUrlFromCatalog ?? epubUrlFromBook

  // Guard: pass null while book is still loading so useEpubReader's effect doesn't fire
  // before ChromelessLayout (and containerRef) is in the DOM. If the catalog was already
  // cached (e.g. from the library page), epubUrl can be non-null even when isLoading=true,
  // causing the effect to fire and return early — then never re-fire (deps unchanged).
  const { containerRef, rendition, book: epubBook, isReady, error: readerError, getToc, navigateToTocEntry } =
    useEpubReader(isLoading ? null : epubUrl, initialCfi)

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

  // Waiting for catalog (or building epub from JSON after catalog confirmed no epubUrl)
  if (!epubUrl && (catalogIsLoading || epubFromBookLoading)) {
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
        bookSource={book.source}
        initialCfi={initialCfi}
      />
    </ChromelessLayout>
  )
}
