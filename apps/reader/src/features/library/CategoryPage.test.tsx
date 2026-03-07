import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CategoryPage from '@/features/library/CategoryPage'
import type { CatalogIndex } from '@/shared/types/global.types'

const mockUseCatalogIndex = vi.fn()

vi.mock('@/shared/hooks/useCatalogIndex', () => ({
  useCatalogIndex: () => mockUseCatalogIndex(),
}))

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

function renderPage(route = '/library/kinh') {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/library/:category" element={<CategoryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CategoryPage', () => {
  beforeEach(() => {
    mockUseCatalogIndex.mockReset()
  })

  it('renders sutra list cards with minimum touch target and lora title', () => {
    mockUseCatalogIndex.mockReturnValue({
      isLoading: false,
      data: catalogFixture,
      error: null,
    })

    renderPage()
    const card = screen.getByRole('link', { name: 'Đọc Kinh Bát Nhã' })
    expect(card).toHaveClass('min-h-[44px]')
    expect(screen.getByText('Kinh Bát Nhã')).toHaveStyle({ fontFamily: 'Lora, serif' })
    expect(screen.getByText('HT. A')).toBeInTheDocument()
  })

  it('renders category not found state for invalid slug', () => {
    mockUseCatalogIndex.mockReturnValue({
      isLoading: false,
      data: catalogFixture,
      error: null,
    })

    renderPage('/library/not-found')
    expect(screen.getByText('Không tìm thấy thể loại')).toBeInTheDocument()
  })
})
