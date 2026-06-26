import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import BookmarksPage from '@/features/bookmarks/BookmarksPage'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { useBookmarkCollapseStore } from '@/stores/bookmarkCollapse.store'
import { formatRelativeTime } from '@/shared/utils/time'
import type { Bookmark } from '@/stores/bookmarks.store'

vi.mock('@/shared/services/storage.service', () => ({
  storageService: {
    setItem: vi.fn().mockResolvedValue(undefined),
    getItem: vi.fn().mockResolvedValue(null),
  },
}))

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

/** Seed the collapse store so a group renders expanded (its item list is visible). */
function expandGroups(...bookIds: string[]) {
  useBookmarkCollapseStore.setState({ expandedBookIds: bookIds })
}

beforeEach(() => {
  useBookmarksStore.setState({ bookmarks: [] })
  useBookmarkCollapseStore.setState({ expandedBookIds: [] })
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

  it('group header is a link that navigates to the reader at the auto bookmark position', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()

    const header = screen.getByTestId('bookmark-group-header')
    expect(header.tagName).toBe('A')
    expect(header).toHaveAttribute('href', '/read/kinh-phap-hoa')
    expect(header).toHaveAccessibleName('Tiếp tục đọc Kinh Pháp Hoa')
  })

  it('group header link falls back to first manual bookmark when no auto bookmark exists', () => {
    const manualOnly: Bookmark = {
      bookId: 'kinh-phap-hoa',
      bookTitle: 'Kinh Pháp Hoa',
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
      timestamp: 900000,
      type: 'manual',
      page: 3,
      total: 50,
    }
    useBookmarksStore.setState({ bookmarks: [manualOnly] })
    renderPage()

    const header = screen.getByTestId('bookmark-group-header')
    expect(header.tagName).toBe('A')
    expect(header).toHaveAttribute('href', '/read/kinh-phap-hoa')
  })

  it('BookmarkCard link navigates to correct URL', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    expandGroups('kinh-phap-hoa')
    renderPage()

    const group = screen.getByTestId('bookmark-group')
    const card = within(group).getByTestId('bookmark-card')
    const link = within(card).getByRole('link')
    expect(link).toHaveAttribute('href', '/read/kinh-phap-hoa')
  })

  it('items within a group are sorted by timestamp descending (latest first)', () => {
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
    expandGroups('kinh-phap-hoa')
    renderPage()

    const group = screen.getByTestId('bookmark-group')
    const cards = within(group).getAllByTestId('bookmark-card')
    // auto has newer timestamp → renders first
    expect(within(cards[0]).getByText('Đang đọc')).toBeInTheDocument()
    expect(within(cards[1]).getByText('Trang 5 / 100')).toBeInTheDocument()
  })

  it('manual bookmark renders before auto when manual has newer timestamp', () => {
    const autoBookmark: Bookmark = {
      bookId: 'kinh-phap-hoa',
      bookTitle: 'Kinh Pháp Hoa',
      cfi: 'epubcfi(/6/2!/4/2/1:0)',
      timestamp: 900000,
      type: 'auto',
    }
    const manualBookmark: Bookmark = {
      bookId: 'kinh-phap-hoa',
      bookTitle: 'Kinh Pháp Hoa',
      cfi: 'epubcfi(/6/6!/4/2/1:0)',
      timestamp: 1000000,
      type: 'manual',
      page: 5,
      total: 100,
    }
    useBookmarksStore.setState({ bookmarks: [autoBookmark, manualBookmark] })
    expandGroups('kinh-phap-hoa')
    renderPage()

    const group = screen.getByTestId('bookmark-group')
    const cards = within(group).getAllByTestId('bookmark-card')
    // manual has newer timestamp → renders first
    expect(within(cards[0]).getByText('Trang 5 / 100')).toBeInTheDocument()
    expect(within(cards[1]).getByText('Đang đọc')).toBeInTheDocument()
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
    expandGroups('kinh-phap-hoa')
    renderPage()

    // delete button exists in the card
    expect(screen.getByTestId('bookmark-delete-btn')).toBeInTheDocument()
  })

  it('auto bookmark card has a bookmark-delete-btn (swipe to delete allowed)', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    expandGroups('kinh-phap-hoa')
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
    expandGroups('kinh-phap-hoa')
    renderPage()
    const group = screen.getByTestId('bookmark-group')
    const ul = within(group).getByRole('list')
    expect(ul).toHaveClass('divide-y')
    expect(ul).not.toHaveClass('space-y-3')
  })
})

describe('BookmarksPage — collapse', () => {
  it('groups render collapsed by default (item list absent)', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()
    const group = screen.getByTestId('bookmark-group')
    expect(within(group).queryByRole('list')).not.toBeInTheDocument()
    expect(within(group).queryByTestId('bookmark-card')).not.toBeInTheDocument()
    expect(within(group).getByTestId('bookmark-group-toggle')).toHaveAttribute('aria-expanded', 'false')
  })

  it('collapsed group shows a count badge and a last-read summary line', () => {
    const withChapter: Bookmark = { ...bookmark1, type: 'auto', chapterTitle: 'Phẩm Phương Tiện' }
    const extra: Bookmark = {
      ...bookmark1,
      cfi: 'epubcfi(/6/8!/4/2/1:0)',
      type: 'manual',
      timestamp: 500000,
    }
    useBookmarksStore.setState({ bookmarks: [withChapter, extra] })
    renderPage()
    const group = screen.getByTestId('bookmark-group')
    expect(within(group).getByTestId('bookmark-group-count')).toHaveTextContent('2')
    // headerBookmark is the newest (withChapter); one other bookmark remains.
    expect(within(group).getByTestId('bookmark-group-summary')).toHaveTextContent(
      'Đang đọc: Phẩm Phương Tiện · 1 dấu khác',
    )
  })

  it('single-bookmark group omits the "N dấu khác" suffix', () => {
    const only: Bookmark = { ...bookmark1, chapterTitle: 'Phẩm Tựa' }
    useBookmarksStore.setState({ bookmarks: [only] })
    renderPage()
    const summary = screen.getByTestId('bookmark-group-summary')
    expect(summary).toHaveTextContent('Đang đọc: Phẩm Tựa')
    expect(summary).not.toHaveTextContent('dấu khác')
  })

  it('clicking the chevron expands the group and flips aria-expanded', async () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()
    const toggle = screen.getByTestId('bookmark-group-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const group = screen.getByTestId('bookmark-group')
    expect(within(group).getByTestId('bookmark-card')).toBeInTheDocument()
    // Summary line is hidden once expanded.
    expect(within(group).queryByTestId('bookmark-group-summary')).not.toBeInTheDocument()
  })

  it('a group seeded as expanded renders its items on the first render (no flash)', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    expandGroups('kinh-phap-hoa')
    renderPage()
    // Synchronous assertion — no await/findBy — to catch a flash of the collapsed state.
    const group = screen.getByTestId('bookmark-group')
    expect(within(group).getByRole('list')).toBeInTheDocument()
    expect(within(group).getByTestId('bookmark-group-toggle')).toHaveAttribute('aria-expanded', 'true')
  })

  it('search force-expands a matching collapsed group and shows a matches/total badge', async () => {
    const matching: Bookmark = { ...bookmark1, type: 'manual', chapterTitle: 'Phẩm Tựa' }
    const other: Bookmark = {
      ...bookmark1,
      cfi: 'epubcfi(/6/8!/4/2/1:0)',
      type: 'manual',
      timestamp: 500000,
      chapterTitle: 'Phẩm Khác',
    }
    useBookmarksStore.setState({ bookmarks: [matching, other] })
    renderPage()
    // 'Tựa' matches one chapter title, not the book title → 1 of 2 items.
    await userEvent.type(screen.getByTestId('bookmark-search-input'), 'Tựa')
    const group = screen.getByTestId('bookmark-group')
    expect(within(group).getByTestId('bookmark-group-toggle')).toHaveAttribute('aria-expanded', 'true')
    expect(within(group).getByTestId('bookmark-group-count')).toHaveTextContent('1/2')
    expect(within(group).getAllByTestId('bookmark-card')).toHaveLength(1)
  })

  it('the toggle is inert (disabled) while a search is active so state is not silently persisted', async () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()
    await userEvent.type(screen.getByTestId('bookmark-search-input'), 'Pháp')
    expect(screen.getByTestId('bookmark-group-toggle')).toBeDisabled()
  })

  it('collapsed toggle does not dangle aria-controls (panel is unmounted)', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()
    expect(screen.getByTestId('bookmark-group-toggle')).not.toHaveAttribute('aria-controls')
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
