import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import BookmarksPage from '@/features/bookmarks/BookmarksPage'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { formatRelativeTime } from '@/shared/utils/time'
import type { Bookmark } from '@/stores/bookmarks.store'

vi.mock('@/shared/hooks/useCatalogIndex', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  useCatalogIndex: (_source: string) => ({
    data: {
      books: [],
      categories: [],
    },
  }),
}))

const bookmark1: Bookmark = {
  bookId: 'kinh-phap-hoa',
  bookTitle: 'Kinh Pháp Hoa',
  cfi: 'epubcfi(/6/2!/4/2/1:0)',
  timestamp: 1000000,
  type: 'auto',
}
const bookmark2: Bookmark = {
  bookId: 'kinh-bat-nha',
  bookTitle: 'Kinh Bát Nhã',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  timestamp: 2000000,
  type: 'auto',
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BookmarksPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useBookmarksStore.setState({ bookmarks: [] })
})

describe('BookmarksPage', () => {
  it('shows empty state when no bookmarks exist', () => {
    renderPage()

    expect(screen.getByTestId('bookmarks-empty-state')).toBeInTheDocument()
    within(screen.getByTestId('bookmarks-empty-state')).getByText(/Chưa có dấu trang nào/)
    expect(screen.getByRole('link', { name: 'Khám phá Thư Viện' })).toHaveAttribute('href', '/library')
    expect(screen.queryByTestId('bookmark-search-input')).not.toBeInTheDocument()
  })

  it('renders bookmark-group sections for each bookmark', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1, bookmark2] })
    renderPage()

    const groups = screen.getAllByTestId('bookmark-group')
    expect(groups).toHaveLength(2)
    expect(screen.getAllByText('Kinh Pháp Hoa').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Kinh Bát Nhã').length).toBeGreaterThan(0)
  })

  it('sorts groups by most-recently-accessed (most recent first)', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1, bookmark2] })
    renderPage()

    const groups = screen.getAllByTestId('bookmark-group')
    // bookmark2 has higher timestamp — its group header should be first
    expect(within(groups[0]).getByTestId('bookmark-group-header')).toHaveTextContent('Kinh Bát Nhã')
    expect(within(groups[1]).getByTestId('bookmark-group-header')).toHaveTextContent('Kinh Pháp Hoa')
  })

  it('BookmarkCard link navigates to correct URL', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()

    const group = screen.getByTestId('bookmark-group')
    const card = within(group).getByTestId('bookmark-card')
    const link = within(card).getByRole('link')
    expect(link).toHaveAttribute('href', '/read/kinh-phap-hoa')
  })

  it('auto-bookmark card renders first within a group that has both types', () => {
    const autoBookmark: Bookmark = {
      bookId: 'kinh-phap-hoa',
      bookTitle: 'Kinh Pháp Hoa',
      cfi: 'epubcfi(/6/2!/4/2/1:0)',
      timestamp: 1000000,
      type: 'auto',
    }
    const manualBookmark: Bookmark = {
      bookId: 'kinh-phap-hoa',
      bookTitle: 'Kinh Pháp Hoa',
      cfi: 'epubcfi(/6/6!/4/2/1:0)',
      timestamp: 900000,
      type: 'manual',
      page: 5,
      total: 100,
    }
    useBookmarksStore.setState({ bookmarks: [manualBookmark, autoBookmark] })
    renderPage()

    const group = screen.getByTestId('bookmark-group')
    const cards = within(group).getAllByTestId('bookmark-card')
    // Auto bookmark card first: shows "Đang đọc" label
    expect(within(cards[0]).getByText('Đang đọc')).toBeInTheDocument()
    // Manual bookmark card second: shows page info
    expect(within(cards[1]).getByText('Trang 5 / 100')).toBeInTheDocument()
  })

  it('manual bookmark card has bookmark-delete-btn wired to onDelete', () => {
    const manualBookmark: Bookmark = {
      bookId: 'kinh-phap-hoa',
      bookTitle: 'Kinh Pháp Hoa',
      cfi: 'epubcfi(/6/6!/4/2/1:0)',
      timestamp: 900000,
      type: 'manual',
    }
    useBookmarksStore.setState({ bookmarks: [manualBookmark] })
    renderPage()

    // delete button exists in the card
    expect(screen.getByTestId('bookmark-delete-btn')).toBeInTheDocument()
  })

  it('auto bookmark card has a bookmark-delete-btn (swipe to delete allowed)', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()

    expect(screen.getByTestId('bookmark-delete-btn')).toBeInTheDocument()
  })
})

describe('BookmarksPage — search', () => {
  it('search input is rendered', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()
    expect(screen.getByTestId('bookmark-search-input')).toBeInTheDocument()
  })

  it('typing filters groups by book title', async () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1, bookmark2] })
    renderPage()
    await userEvent.type(screen.getByTestId('bookmark-search-input'), 'Pháp Hoa')
    const groups = screen.getAllByTestId('bookmark-group')
    expect(groups).toHaveLength(1)
    expect(within(groups[0]).getByTestId('bookmark-group-header')).toHaveTextContent('Kinh Pháp Hoa')
  })

  it('typing filters groups by chapter title', async () => {
    const bookmarkWithChapter: Bookmark = {
      bookId: 'kinh-phap-hoa',
      bookTitle: 'Kinh Pháp Hoa',
      cfi: 'epubcfi(/6/6!/4/2/1:0)',
      timestamp: 1000000,
      type: 'manual',
      chapterTitle: 'Phẩm Phương Tiện',
    }
    useBookmarksStore.setState({ bookmarks: [bookmarkWithChapter, bookmark2] })
    renderPage()
    await userEvent.type(screen.getByTestId('bookmark-search-input'), 'Phương Tiện')
    const groups = screen.getAllByTestId('bookmark-group')
    expect(groups).toHaveLength(1)
    expect(within(groups[0]).getByTestId('bookmark-group-header')).toHaveTextContent('Kinh Pháp Hoa')
  })

  it('clearing search restores all groups', async () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1, bookmark2] })
    renderPage()
    const input = screen.getByTestId('bookmark-search-input')
    await userEvent.type(input, 'Pháp Hoa')
    expect(screen.getAllByTestId('bookmark-group')).toHaveLength(1)
    await userEvent.clear(input)
    expect(screen.getAllByTestId('bookmark-group')).toHaveLength(2)
  })

  it('search with no match shows no-results message, not empty state', async () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()
    await userEvent.type(screen.getByTestId('bookmark-search-input'), 'xyznotfound')
    expect(screen.queryByTestId('bookmarks-empty-state')).not.toBeInTheDocument()
    expect(screen.getByText('Không tìm thấy dấu trang nào.')).toBeInTheDocument()
  })

  it('group section has card styling', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()
    const group = screen.getByTestId('bookmark-group')
    expect(group).toHaveClass('rounded-2xl')
    expect(group).toHaveClass('overflow-hidden')
  })

  it('book title match shows all items in the group regardless of individual chapter titles', async () => {
    const b1: Bookmark = { ...bookmark1, type: 'manual', chapterTitle: 'Phẩm Tựa' }
    const b2: Bookmark = { ...bookmark1, cfi: 'epubcfi(/6/8!/4/2/1:0)', type: 'manual' }
    useBookmarksStore.setState({ bookmarks: [b1, b2] })
    renderPage()
    await userEvent.type(screen.getByTestId('bookmark-search-input'), 'Pháp Hoa')
    const groups = screen.getAllByTestId('bookmark-group')
    expect(groups).toHaveLength(1)
    expect(within(groups[0]).getAllByTestId('bookmark-card')).toHaveLength(2)
  })

  it('bookmark list uses divide-y not space-y-3', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()
    const group = screen.getByTestId('bookmark-group')
    const ul = within(group).getByRole('list')
    expect(ul).toHaveClass('divide-y')
    expect(ul).not.toHaveClass('space-y-3')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'))
  })

  it('returns "vừa xong" for less than 60 seconds ago', () => {
    const ts = Date.now() - 30_000
    expect(formatRelativeTime(ts)).toBe('vừa xong')
  })

  it('returns minutes for less than 60 minutes ago', () => {
    const ts = Date.now() - 5 * 60_000
    expect(formatRelativeTime(ts)).toBe('5 phút trước')
  })

  it('returns hours for less than 24 hours ago', () => {
    const ts = Date.now() - 3 * 3600_000
    expect(formatRelativeTime(ts)).toBe('3 giờ trước')
  })

  it('returns days for less than 7 days ago', () => {
    const ts = Date.now() - 3 * 86400_000
    expect(formatRelativeTime(ts)).toBe('3 ngày trước')
  })

  it('returns weeks for 7 days or more ago', () => {
    const ts = Date.now() - 14 * 86400_000
    expect(formatRelativeTime(ts)).toBe('2 tuần trước')
  })
})
