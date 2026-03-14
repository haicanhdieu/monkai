import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibrarySearchHub } from '@/features/library/LibrarySearchHub'
import type { LibraryCategory } from '@/features/library/library.types'
import type { CatalogBook } from '@/shared/types/global.types'

const booksFixture: CatalogBook[] = [
  {
    id: 'book-title-hit',
    title: 'Bát Nhã Tâm Kinh',
    category: 'Kinh',
    categorySlug: 'kinh',
    subcategory: 'dai-thua',
    translator: 'HT. A',
    coverImageUrl: null,
  },
  {
    id: 'book-category-hit',
    title: 'Bộ Luận Câu Xá',
    category: 'Bát Nhã',
    categorySlug: 'bat-nha',
    subcategory: 'luan',
    translator: 'HT. B',
    coverImageUrl: null,
  },
]

const categoriesFixture: LibraryCategory[] = [
  {
    slug: 'kinh',
    displayName: 'Kinh',
    count: 1,
    books: [booksFixture[0]],
  },
  {
    slug: 'bat-nha',
    displayName: 'Bát Nhã',
    count: 1,
    books: [booksFixture[1]],
  },
]

describe('LibrarySearchHub', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows category grid when query is empty', () => {
    render(
      <MemoryRouter>
        <LibrarySearchHub categories={categoriesFixture} books={booksFixture} />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('category-grid')).toBeInTheDocument()
  })

  it('debounces search by 250ms before showing results', async () => {
    vi.useFakeTimers()
    render(
      <MemoryRouter>
        <LibrarySearchHub categories={categoriesFixture} books={booksFixture} />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm kiếm kinh sách' }), {
      target: { value: 'Bát Nhã' },
    })

    await act(async () => {
      vi.advanceTimersByTime(249)
    })
    expect(screen.getByTestId('category-grid')).toBeInTheDocument()
    expect(screen.queryByLabelText('Kết quả tìm kiếm')).not.toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByLabelText('Kết quả tìm kiếm')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Đọc Bát Nhã Tâm Kinh/i })).toBeInTheDocument()
  })

  it('navigates to /read/:bookId on result tap and keeps title-hit ranking first', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LibrarySearchHub categories={categoriesFixture} books={booksFixture} />
      </MemoryRouter>,
    )

    await user.type(screen.getByRole('textbox', { name: 'Tìm kiếm kinh sách' }), 'Bát Nhã')
    await waitFor(() => expect(screen.getByLabelText('Kết quả tìm kiếm')).toBeInTheDocument())

    const results = screen.getAllByRole('link', { name: /Đọc/i })
    expect(results[0]).toHaveAttribute('href', '/read/book-title-hit')
    expect(results[1]).toHaveAttribute('href', '/read/book-category-hit')

    await user.click(results[0])
    expect(results[0]).toHaveAttribute('href', '/read/book-title-hit')
  })

  it('shows calm no-result message when search has no matches', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LibrarySearchHub categories={categoriesFixture} books={booksFixture} />
      </MemoryRouter>,
    )

    await user.type(screen.getByRole('textbox', { name: 'Tìm kiếm kinh sách' }), 'khong-ton-tai')
    await waitFor(() => expect(screen.getByText('Không tìm thấy kết quả')).toBeInTheDocument())
  })
})
