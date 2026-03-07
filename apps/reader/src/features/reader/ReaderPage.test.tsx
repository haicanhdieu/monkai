import { render, screen } from '@testing-library/react'
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

function renderReaderPage(bookId = 'bat-nha') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/read/${bookId}`]}>
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
    useReaderStore.getState().reset()
  })

  // AC 2 of 3.2 — loading skeleton
  it('renders skeleton while book is loading', () => {
    mockUseBook.mockReturnValue({ isLoading: true, data: undefined, error: null })
    renderReaderPage()
    expect(screen.getByTestId('reader-loading')).toBeInTheDocument()
    expect(screen.getAllByTestId('skeleton-line').length).toBeGreaterThan(0)
  })

  // AC 1, 3 of 3.2 — success renders engine
  it('renders ReaderEngine and ChromelessLayout on successful data load', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    renderReaderPage()
    expect(screen.getByTestId('chromeless-layout')).toBeInTheDocument()
    expect(screen.getByTestId('reader-engine')).toBeInTheDocument()
  })

  // AC 4 of 3.2 — store reset on new book (assert on store state, not brittle spies)
  it('resets store with new bookId and empty pages when book data loads', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    renderReaderPage()
    expect(useReaderStore.getState().bookId).toBe('bat-nha')
    expect(useReaderStore.getState().pages).toEqual([])
  })

  // AC 5 of 3.2, AC 1 of 3.5 — network error
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

  // AC 2 of 3.5 — parse/schema error never shows raw Zod output
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

  // AC 3 of 3.2 — cached book renders without loading flash
  it('renders engine directly without skeleton when book is cached', () => {
    mockUseBook.mockReturnValue({ isLoading: false, data: bookFixture, error: null })
    renderReaderPage()
    expect(screen.queryByTestId('reader-loading')).not.toBeInTheDocument()
    expect(screen.getByTestId('reader-engine')).toBeInTheDocument()
  })
})
