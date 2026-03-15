import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import LibraryPage from '@/features/library/LibraryPage'
import { queryKeys } from '@/shared/constants/query.keys'
import type { CatalogIndex } from '@/shared/types/global.types'

const cachedCatalogFixture: CatalogIndex = {
  books: [
    {
      id: 'book-1',
      title: 'Kinh Bát Nhã',
      category: 'Kinh',
      categorySlug: 'kinh',
      subcategory: 'bat-nha',
      translator: 'HT. A',
      coverImageUrl: null,
      artifacts: [],
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

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })
}

describe('LibraryPage offline parity', () => {
  it('keeps search working from cached catalog while network is unavailable', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    try {
      const queryClient = createQueryClient()
      queryClient.setQueryData(queryKeys.catalog(), cachedCatalogFixture)

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <LibraryPage />
          </MemoryRouter>
        </QueryClientProvider>,
      )

      const user = userEvent.setup()
      await user.type(screen.getByRole('textbox', { name: 'Tìm kiếm kinh sách' }), 'Bát Nhã')

      await waitFor(() => expect(screen.getByLabelText('Kết quả tìm kiếm')).toBeInTheDocument())
      expect(screen.getByRole('link', { name: /Đọc Kinh Bát Nhã/i })).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      fetchMock.mockRestore()
    }
  })
})
