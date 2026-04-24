import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DiscoverStrip } from '@/features/home/DiscoverStrip'

const mockUseCatalogIndex = vi.fn()
const mockUseActiveSource = vi.fn()

vi.mock('@/shared/hooks/useCatalogIndex', () => ({
  useCatalogIndex: (source: string) => mockUseCatalogIndex(source),
}))

vi.mock('@/shared/stores/useActiveSource', () => ({
  useActiveSource: () => mockUseActiveSource(),
}))

function makeBooks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `book-${i}`,
    title: `Book Title ${i}`,
    category: 'cat',
    categorySlug: 'cat',
    subcategory: '',
    translator: '',
    coverImageUrl: null,
    artifacts: [],
    source: 'vbeta',
  }))
}

function renderStrip() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DiscoverStrip />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockUseActiveSource.mockReturnValue({ activeSource: 'vbeta', setActiveSource: vi.fn() })
  mockUseCatalogIndex.mockReturnValue({ data: { books: [], categories: [] }, isLoading: false, isError: false })
})

describe('DiscoverStrip', () => {
  it('renders 4 book cover links and section heading when catalog has books', () => {
    const books = makeBooks(6)
    mockUseCatalogIndex.mockReturnValue({ data: { books, categories: [] }, isLoading: false, isError: false })

    renderStrip()

    expect(screen.getByRole('heading', { name: 'Khám Phá' })).toBeInTheDocument()
    const links = screen.getAllByRole('listitem')
    expect(links).toHaveLength(4)
    links.forEach((item) => {
      expect(item).toHaveAttribute('aria-label', expect.stringMatching(/^Đọc /))
    })
  })

  it('renders skeleton tiles while loading', () => {
    mockUseCatalogIndex.mockReturnValue({ data: undefined, isLoading: true, isError: false })

    renderStrip()

    expect(screen.getByTestId('discover-strip-skeleton')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('renders nothing when catalog is empty', () => {
    mockUseCatalogIndex.mockReturnValue({ data: { books: [], categories: [] }, isLoading: false, isError: false })

    renderStrip()

    expect(screen.queryByTestId('discover-strip')).toBeNull()
  })

  it('renders nothing when catalog errors', () => {
    mockUseCatalogIndex.mockReturnValue({ data: undefined, isLoading: false, isError: true })

    renderStrip()

    expect(screen.queryByTestId('discover-strip')).toBeNull()
  })

  it('each tile links to the correct book route', () => {
    const books = makeBooks(4)
    mockUseCatalogIndex.mockReturnValue({ data: { books, categories: [] }, isLoading: false, isError: false })

    renderStrip()

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    items.forEach((item) => {
      const href = item.getAttribute('href') ?? ''
      expect(href).toMatch(/^\/read\/book-\d+$/)
    })
  })

  it('works with vnthuquan source', () => {
    mockUseActiveSource.mockReturnValue({ activeSource: 'vnthuquan', setActiveSource: vi.fn() })
    mockUseCatalogIndex.mockReturnValue({ data: { books: makeBooks(4), categories: [] }, isLoading: false, isError: false })

    renderStrip()

    expect(mockUseCatalogIndex).toHaveBeenCalledWith('vnthuquan')
  })
})
