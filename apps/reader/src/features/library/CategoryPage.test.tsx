import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CategoryPage from '@/features/library/CategoryPage'
import { DataError } from '@/shared/services/data.service'
import type { CatalogIndex } from '@/shared/types/global.types'

const mockUseCatalogIndex = vi.fn()
const mockUseOnlineStatus = vi.fn()
const mockUseParams = vi.fn()

vi.mock('@/shared/hooks/useCatalogIndex', () => ({
  useCatalogIndex: () => mockUseCatalogIndex(),
}))

vi.mock('@/shared/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: (() => mockUseParams()) as typeof actual.useParams,
  }
})

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
    mockUseOnlineStatus.mockReturnValue(true)
    mockUseParams.mockReturnValue({ category: 'kinh' })
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
    mockUseParams.mockReturnValue({ category: 'not-found' })

    renderPage()
    expect(screen.getByText('Không tìm thấy thể loại')).toBeInTheDocument()
  })

  it('shows offline message when catalog network error and user is offline', () => {
    mockUseCatalogIndex.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new DataError('network', 'Network request failed'),
    })
    mockUseOnlineStatus.mockReturnValue(false)

    renderPage()
    expect(screen.getByText('Bạn đang ngoại tuyến')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Kết nối mạng để tải thư viện. Hoặc mở sách từ Trang chủ \/ Dấu trang/,
      ),
    ).toBeInTheDocument()
  })

  it('shows generic error when catalog network error but user is online', () => {
    mockUseCatalogIndex.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new DataError('network', 'Network request failed'),
    })
    mockUseOnlineStatus.mockReturnValue(true)

    renderPage()
    expect(screen.getByText('Đã có sự cố kết nối')).toBeInTheDocument()
    expect(screen.queryByText('Bạn đang ngoại tuyến')).not.toBeInTheDocument()
  })

  it('shows generic error when catalog fails with non-DataError and user is offline', () => {
    mockUseCatalogIndex.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error('Something else'),
    })
    mockUseOnlineStatus.mockReturnValue(false)

    renderPage()
    expect(screen.getByText('Đã có sự cố kết nối')).toBeInTheDocument()
    expect(screen.queryByText('Bạn đang ngoại tuyến')).not.toBeInTheDocument()
  })

  it('shows category not found when catalog is loaded but category param is empty', () => {
    mockUseCatalogIndex.mockReturnValue({
      isLoading: false,
      data: catalogFixture,
      error: null,
    })
    mockUseParams.mockReturnValue({ category: '' })
    renderPage()
    expect(screen.getByText('Không tìm thấy thể loại')).toBeInTheDocument()
  })
})
