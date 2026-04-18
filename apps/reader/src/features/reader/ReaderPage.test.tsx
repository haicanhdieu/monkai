import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReaderPage from '@/features/reader/ReaderPage'
import { useReaderStore } from '@/stores/reader.store'
import { DataError } from '@/shared/services/data.service'
import type { Book } from '@/shared/types/global.types'

// Mock useBook and useCatalogIndex to control fetch state and epub URL
const mockUseBook = vi.fn()
const mockUseCatalogIndex = vi.fn()
const mockUseOnlineStatus = vi.fn()
const mockUseEpubFromBook = vi.fn()
const mockUseEpubReader = vi.fn()
vi.mock('@/shared/hooks/useBook', () => ({
  useBook: (id: string) => mockUseBook(id),
}))
vi.mock('@/shared/hooks/useCatalogIndex', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  useCatalogIndex: (_source: string) => mockUseCatalogIndex(),
}))

vi.mock('@/shared/stores/useActiveSource', () => ({
  useActiveSource: () => ({ activeSource: 'vbeta', setActiveSource: vi.fn() }),
}))
vi.mock('@/shared/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}))
vi.mock('@/features/reader/useEpubFromBook', () => ({
  useEpubFromBook: (book: Book | null) => mockUseEpubFromBook(book),
}))

vi.mock('@/features/reader/useEpubReader', () => ({
  useEpubReader: (epubUrl: string | null) =>
    mockUseEpubReader(epubUrl) || {
      containerRef: { current: null },
      rendition: null,
      book: null,
      isReady: true,
      error: null,
      getToc: vi.fn(),
      navigateToTocEntry: vi.fn(),
    },
}))

const mockGetItem = vi.fn()
vi.mock('@/shared/services/storage.service', () => ({
  storageService: { getItem: (key: string) => mockGetItem(key) },
}))

// Prevent ChromelessLayout/ReaderEngine from running real font/DOM logic
vi.mock('@/features/reader/ChromelessLayout', () => ({
  ChromelessLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chromeless-layout">{children}</div>
  ),
}))

vi.mock('@/features/reader/ReaderEngine', () => ({
  ReaderEngine: ({
    bookId,
    bookTitle,
    initialCfi,
  }: {
    bookId: string
    bookTitle: string
    initialCfi?: string | null
  }) => (
    <div
      data-testid="reader-engine"
      data-book-id={bookId}
      data-book-title={bookTitle || ''}
      data-initial-cfi={initialCfi ?? ''}
    >
      {bookId}
    </div>
  ),
}))

const bookFixture: Book = {
  id: 'bat-nha',
  title: 'Kinh Bát Nhã',
  category: 'Kinh',
  subcategory: 'bat-nha',
  translator: 'HT. A',
  coverImageUrl: null,
  source: 'vbeta',
  content: ['Đoạn 1.', 'Đoạn 2.', 'Đoạn 3.'],
}

function renderReaderPage(
  bookId = 'bat-nha',
  locationState?: { page?: number; cfi?: string },
) {
  const entry =
    locationState != null
      ? { pathname: `/read/${bookId}`, state: locationState }
      : `/read/${bookId}`
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/read/:bookId" element={<ReaderPage />} />
          <Route path="/library" element={<div data-testid="library-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const catalogWithEpub = (bookId: string, epubUrl = '/book.epub') => ({
  data: {
    books: [{ id: bookId, title: 'Test', epubUrl }],
  },
})

describe('ReaderPage', () => {
  beforeEach(() => {
    mockUseBook.mockReset()
    mockUseCatalogIndex.mockReset()
    mockUseCatalogIndex.mockReturnValue(catalogWithEpub('bat-nha'))
    mockUseOnlineStatus.mockReturnValue(true)
    mockUseEpubFromBook.mockReset()
    mockUseEpubFromBook.mockReturnValue({ epubUrl: null, isLoading: false, error: null })
    mockUseEpubReader.mockReset()
    mockGetItem.mockReset()
    mockGetItem.mockResolvedValue(null)
    useReaderStore.getState().reset()
  })

  it('renders skeleton while book is loading', () => {
    mockUseBook.mockReturnValue({ isLoading: true, data: undefined, error: null })
    renderReaderPage()
    expect(screen.getByTestId('reader-loading')).toBeInTheDocument()
    expect(screen.getAllByTestId('skeleton-line').length).toBeGreaterThan(0)
  })

  it('renders ReaderEngine and ChromelessLayout on successful data load', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    renderReaderPage()
    expect(screen.getByTestId('chromeless-layout')).toBeInTheDocument()
    expect(screen.getByTestId('reader-engine')).toBeInTheDocument()
  })

  it('shows not_found error when bookId param is absent from the route', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: undefined, error: null })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/read']}>
          <Routes>
            <Route path="/read" element={<ReaderPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Không thể tìm thấy nội dung kinh này.')).toBeInTheDocument()
  })

  it('shows network error message when book fails to fetch', () => {
    mockUseBook.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new DataError('network', 'Network failed'),
    })
    renderReaderPage()
    expect(
      screen.getByText(
        'Nội dung này chưa được tải về. Vui lòng kết nối mạng và thử lại.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByTestId('back-to-library')).toBeInTheDocument()
  })

  it('shows offline guidance when book network error and user is offline', () => {
    mockUseBook.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new DataError('network', 'Network failed'),
    })
    mockUseOnlineStatus.mockReturnValue(false)
    renderReaderPage()
    expect(
      screen.getByText(
        'Sách này chưa có trong bộ nhớ đệm. Hãy kết nối mạng, mở sách một lần, sau đó bạn có thể đọc offline.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByTestId('back-to-library')).toBeInTheDocument()
  })

  it('shows schema error message when book payload fails Zod validation', () => {
    mockUseBook.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new DataError('parse', 'Schema validation failed', { issues: ['bad field'] }),
    })
    renderReaderPage()
    expect(screen.getByText('Nội dung kinh bị lỗi định dạng.')).toBeInTheDocument()
    expect(screen.queryByText(/bad field/i)).not.toBeInTheDocument()
  })

  it('shows generic error message for non-DataError exceptions', () => {
    mockUseBook.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error('unexpected failure'),
    })
    renderReaderPage()
    expect(screen.getByText('Không thể tải nội dung kinh này.')).toBeInTheDocument()
  })

  it('renders engine directly without skeleton when book is cached', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    mockUseCatalogIndex.mockReturnValue(catalogWithEpub('bat-nha'))
    renderReaderPage()
    expect(screen.queryByTestId('reader-loading')).not.toBeInTheDocument()
    expect(screen.getByTestId('reader-engine')).toBeInTheDocument()
  })

  it('passes bookId and bookTitle from catalog and book to ReaderEngine and calls useEpubReader with catalog epubUrl', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    mockUseCatalogIndex.mockReturnValue(catalogWithEpub('bat-nha', '/path/to/book.epub'))
    renderReaderPage('bat-nha')
    const engine = screen.getByTestId('reader-engine')
    expect(engine).toHaveAttribute('data-book-id', 'bat-nha')
    expect(engine).toHaveAttribute('data-book-title', 'Kinh Bát Nhã')
    expect(mockUseEpubReader).toHaveBeenCalledWith('/path/to/book.epub')
  })

  it('passes initialCfi from location.state when navigating from bookmark link', () => {
    const savedCfi = 'epubcfi(/6/2!/4/2/1:0)'
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    mockUseCatalogIndex.mockReturnValue(catalogWithEpub('bat-nha'))
    renderReaderPage('bat-nha', { cfi: savedCfi })
    const engine = screen.getByTestId('reader-engine')
    expect(engine).toHaveAttribute('data-initial-cfi', savedCfi)
  })

  it('passes empty initialCfi when no location.state and renders ReaderEngine for resume flow', () => {
    mockGetItem.mockResolvedValue({ bookId: 'bat-nha', cfi: 'epubcfi(/6/2!/4/2/1:0)' })
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    mockUseCatalogIndex.mockReturnValue(catalogWithEpub('bat-nha'))
    renderReaderPage('bat-nha')
    const engine = screen.getByTestId('reader-engine')
    expect(engine).toHaveAttribute('data-initial-cfi', '')
    expect(engine).toBeInTheDocument()
  })

  it('when catalog has no epubUrl, uses useEpubFromBook and passes blob URL to ReaderEngine', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    mockUseCatalogIndex.mockReturnValue({
      data: { books: [{ id: 'bat-nha', title: 'Test' }] },
    })
    mockUseEpubFromBook.mockReturnValue({
      epubUrl: 'blob:https://example.com/mock-epub',
      isLoading: false,
      error: null,
    })
    renderReaderPage('bat-nha')
    expect(mockUseEpubReader).toHaveBeenCalledWith('blob:https://example.com/mock-epub')
  })

  it('shows format error when catalog has no epubUrl and useEpubFromBook returns error', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    mockUseCatalogIndex.mockReturnValue({
      data: { books: [{ id: 'bat-nha', title: 'Test' }] },
    })
    mockUseEpubFromBook.mockReturnValue({
      epubUrl: null,
      isLoading: false,
      error: new Error('Conversion failed'),
    })
    renderReaderPage('bat-nha')
    expect(screen.getByText('Nội dung kinh bị lỗi định dạng.')).toBeInTheDocument()
  })

  it('shows loading when catalog has no epubUrl and useEpubFromBook is still loading', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    mockUseCatalogIndex.mockReturnValue({
      data: { books: [{ id: 'bat-nha', title: 'Test' }] },
    })
    mockUseEpubFromBook.mockReturnValue({
      epubUrl: null,
      isLoading: true,
      error: null,
    })
    renderReaderPage('bat-nha')
    expect(screen.getByTestId('reader-loading')).toBeInTheDocument()
  })
})
