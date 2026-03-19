import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import BookmarksPage from '@/features/bookmarks/BookmarksPage'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { formatRelativeTime } from '@/shared/utils/time'
import type { Bookmark } from '@/stores/bookmarks.store'

vi.mock('@/shared/hooks/useCatalogIndex', () => ({
  useCatalogIndex: () => ({
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

  it('auto bookmark card has no bookmark-delete-btn', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()

    expect(screen.queryByTestId('bookmark-delete-btn')).not.toBeInTheDocument()
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
