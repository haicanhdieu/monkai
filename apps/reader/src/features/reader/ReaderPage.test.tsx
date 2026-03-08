import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReaderPage from '@/features/reader/ReaderPage'
import { useReaderStore } from '@/stores/reader.store'
import { DataError } from '@/shared/services/data.service'
import type { Book } from '@/shared/types/global.types'

// Mock useBook to control fetch state
const mockUseBook = vi.fn()
vi.mock('@/shared/hooks/useBook', () => ({
  useBook: (id: string) => mockUseBook(id),
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
  ReaderEngine: ({ paragraphs }: { paragraphs: string[] }) => (
    <div data-testid="reader-engine">{paragraphs.length} paragraphs</div>
  ),
}))

const bookFixture: Book = {
  id: 'bat-nha',
  title: 'Kinh Bát Nhã',
  category: 'Kinh',
  subcategory: 'bat-nha',
  translator: 'HT. A',
  content: ['Đoạn 1.', 'Đoạn 2.', 'Đoạn 3.'],
}

const bookFixtureSeoSlug: Book = {
  id: 'seo-slug-internal',
  title: 'Kinh Test',
  category: 'Kinh',
  subcategory: 'test',
  translator: 'HT. Test',
  content: ['Đoạn 1.'],
}

function renderReaderPage(bookId = 'bat-nha', locationState?: { page?: number }) {
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

describe('ReaderPage', () => {
  beforeEach(() => {
    mockUseBook.mockReset()
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

  it('resets store with new bookId, empty pages, and reset pageBoundaries when book data loads', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    renderReaderPage()
    expect(useReaderStore.getState().bookId).toBe('bat-nha')
    expect(useReaderStore.getState().pages).toEqual([])
    expect(useReaderStore.getState().pageBoundaries).toEqual([0])
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

  it('shows network error message when book fails to fetch (offline)', () => {
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

  // Regression: store must hold the URL param (catalog UUID), NOT book.id (SEO slug)
  it('stores URL param bookId (catalog UUID) in store, not book.id (SEO slug)', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixtureSeoSlug, error: null })
    renderReaderPage('catalog-uuid-123')
    expect(mockUseBook).toHaveBeenCalledWith('catalog-uuid-123')
    expect(useReaderStore.getState().bookId).toBe('catalog-uuid-123')
  })

  it('updates store correctly when navigating from one book to another without full reset', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    const { unmount } = renderReaderPage('bat-nha')
    expect(useReaderStore.getState().bookId).toBe('bat-nha')

    // Navigate to a different book — store should reflect the new book without an explicit reset
    unmount()
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixtureSeoSlug, error: null })
    renderReaderPage('catalog-uuid-123')
    expect(useReaderStore.getState().bookId).toBe('catalog-uuid-123')
    expect(useReaderStore.getState().pages).toEqual([])
    expect(useReaderStore.getState().pageBoundaries).toEqual([0])
  })

  it('renders engine directly without skeleton when book is cached', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    renderReaderPage()
    expect(screen.queryByTestId('reader-loading')).not.toBeInTheDocument()
    expect(screen.getByTestId('reader-engine')).toBeInTheDocument()
  })

  it('sets currentPage to 0 when opening a different book than last read (avoids reusing previous book page)', async () => {
    mockGetItem.mockResolvedValue({ bookId: 'other-book-uuid', page: 5 })
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    renderReaderPage('bat-nha')
    await waitFor(() => {
      expect(useReaderStore.getState().currentPage).toBe(0)
    })
  })

  it('restores currentPage from storage when opening the same book as last read', async () => {
    mockGetItem.mockResolvedValue({ bookId: 'bat-nha', page: 2 })
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    renderReaderPage('bat-nha')
    await waitFor(() => {
      expect(useReaderStore.getState().currentPage).toBe(2)
    })
  })

  it('opens at bookmark page when navigating from bookmark link (location state has page)', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    renderReaderPage('bat-nha', { page: 10 })
    expect(useReaderStore.getState().currentPage).toBe(10)
  })
})
