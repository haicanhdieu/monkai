import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import HomePage from '@/features/home/HomePage'
import { useReaderStore } from '@/stores/reader.store'

const mockUseCatalogIndex = vi.fn()
const mockUseActiveSource = vi.fn()

vi.mock('@/shared/hooks/useCatalogIndex', () => ({
  useCatalogIndex: (source: string) => mockUseCatalogIndex(source),
}))

vi.mock('@/shared/stores/useActiveSource', () => ({
  useActiveSource: () => mockUseActiveSource(),
}))

function renderHomePage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useReaderStore.setState({
    lastReadBookId: '',
    lastReadBookTitle: '',
    lastReadPage: 0,
    lastReadTotalPages: 0,
    lastReadChapterTitle: '',
    lastReadBookProgressApprox: null,
  })
  mockUseActiveSource.mockReturnValue({ activeSource: 'vbeta', setActiveSource: vi.fn() })
  mockUseCatalogIndex.mockReturnValue({ data: { books: [], categories: [] }, isLoading: false, isError: false })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HomePage', () => {
  it('renders page heading and quick links', () => {
    renderHomePage()

    expect(screen.getByRole('heading', { name: 'Trang Chủ' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Thư Viện' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('link', { name: 'Dấu Trang' })).toHaveAttribute('href', '/bookmarks')
  })

  it('does not show "Continue Reading" section when no last read position', () => {
    useReaderStore.setState({ lastReadBookId: '', lastReadPage: 0 })
    renderHomePage()

    expect(screen.queryByLabelText('Tiếp tục đọc')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Tiếp tục đọc/ })).not.toBeInTheDocument()
  })

  it('shows "Continue Reading" card with correct link when last read position exists', () => {
    useReaderStore.setState({
      lastReadBookId: 'kinh-phap-hoa',
      lastReadBookTitle: 'Kinh Pháp Hoa',
      lastReadPage: 15,
      lastReadTotalPages: 99,
    })
    renderHomePage()

    expect(screen.getByLabelText('Tiếp tục đọc')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Tiếp tục đọc Kinh Pháp Hoa/ }),
    ).toHaveAttribute('href', '/read/kinh-phap-hoa')
    expect(screen.getByText('Kinh Pháp Hoa', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.getAllByText(/Trang 15/).length).toBeGreaterThanOrEqual(1)
  })

  it('does not expose dead-end notification button', () => {
    renderHomePage()

    expect(screen.queryByRole('button', { name: 'Thông báo' })).not.toBeInTheDocument()
  })

  it('shows chapter title before page count in Continue Reading card when lastReadChapterTitle is set', () => {
    useReaderStore.setState({
      lastReadBookId: 'kinh-phap-hoa',
      lastReadBookTitle: 'Kinh Pháp Hoa',
      lastReadPage: 15,
      lastReadTotalPages: 99,
      lastReadChapterTitle: 'Phẩm Tựa',
    })
    renderHomePage()
    expect(screen.getByText('Phẩm Tựa')).toBeInTheDocument()
    expect(screen.getByText('|')).toBeInTheDocument()
  })

  it('does not show chapter title or separator when lastReadChapterTitle is empty', () => {
    useReaderStore.setState({
      lastReadBookId: 'kinh-phap-hoa',
      lastReadBookTitle: 'Kinh Pháp Hoa',
      lastReadPage: 15,
      lastReadTotalPages: 99,
      lastReadChapterTitle: '',
    })
    renderHomePage()
    expect(screen.queryByText('|')).not.toBeInTheDocument()
  })

  it('shows approximate whole-book percent on progress bar when lastReadBookProgressApprox is set', () => {
    useReaderStore.setState({
      lastReadBookId: 'kinh-phap-hoa',
      lastReadBookTitle: 'Kinh Pháp Hoa',
      lastReadPage: 2,
      lastReadTotalPages: 10,
      lastReadBookProgressApprox: 0.42,
    })
    renderHomePage()
    expect(screen.getByText('~42%')).toBeInTheDocument()
  })

  it('renders Discover Strip section when catalog has books', () => {
    const books = Array.from({ length: 4 }, (_, i) => ({
      id: `book-${i}`,
      title: `Book ${i}`,
      category: '',
      categorySlug: '',
      subcategory: '',
      translator: '',
      coverImageUrl: null,
      artifacts: [],
      source: 'vbeta',
    }))
    mockUseCatalogIndex.mockReturnValue({ data: { books, categories: [] }, isLoading: false, isError: false })

    renderHomePage()

    expect(screen.getByLabelText('Khám phá')).toBeInTheDocument()
  })

  it('does not render Discover Strip book links when catalog is loading', () => {
    mockUseCatalogIndex.mockReturnValue({ data: undefined, isLoading: true, isError: false })

    renderHomePage()

    expect(screen.getByTestId('discover-strip-skeleton')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})
