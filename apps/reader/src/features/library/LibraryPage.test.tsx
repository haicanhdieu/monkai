import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LibraryPage from '@/features/library/LibraryPage'
import type { CatalogIndex } from '@/shared/types/global.types'

const mockUseCatalogIndex = vi.fn()

vi.mock('@/shared/hooks/useCatalogIndex', () => ({
  useCatalogIndex: () => mockUseCatalogIndex(),
}))

function renderPage() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const catalogFixture: CatalogIndex = {
  books: [
    {
      id: 'book-1',
      title: 'Kinh Bát Nhã',
      category: 'Kinh',
      categorySlug: 'kinh',
      subcategory: 'bat-nha',
      translator: 'HT. A',
      coverImageUrl: null,
    },
  ],
  categories: [
    {
      slug: 'kinh',
      displayName: 'Kinh',
      count: 1,
    },
  ],
}

describe('LibraryPage', () => {
  beforeEach(() => {
    mockUseCatalogIndex.mockReset()
  })

  it('renders skeleton card layout while loading', () => {
    mockUseCatalogIndex.mockReturnValue({
      isLoading: true,
      data: undefined,
      error: null,
    })

    renderPage()
    expect(screen.getByTestId('library-skeleton-grid')).toBeInTheDocument()
  })

  it('renders category grid when data is loaded', () => {
    mockUseCatalogIndex.mockReturnValue({
      isLoading: false,
      data: catalogFixture,
      error: null,
    })

    renderPage()
    expect(screen.getByLabelText('Danh mục thể loại')).toBeInTheDocument()
    expect(screen.getByText('Kinh')).toBeInTheDocument()
  })

  it('renders calm error page without exposing raw technical error', () => {
    mockUseCatalogIndex.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error('Network stack trace and internals'),
    })

    renderPage()
    expect(screen.getByText('Đã có sự cố kết nối')).toBeInTheDocument()
    expect(screen.queryByText(/stack trace/i)).not.toBeInTheDocument()
  })
})
