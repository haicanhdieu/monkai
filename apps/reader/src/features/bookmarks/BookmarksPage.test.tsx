import { render, screen } from '@testing-library/react'
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
}
const bookmark2: Bookmark = {
  bookId: 'kinh-bat-nha',
  bookTitle: 'Kinh Bát Nhã',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  timestamp: 2000000,
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

    expect(screen.getByText('Chưa có đánh dấu nào. Hãy bắt đầu đọc một bản kinh!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Khám phá Thư Viện' })).toHaveAttribute('href', '/library')
  })

  it('renders BookmarkCard for each bookmark', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1, bookmark2] })
    renderPage()

    expect(screen.getByText('Kinh Pháp Hoa')).toBeInTheDocument()
    expect(screen.getByText('Kinh Bát Nhã')).toBeInTheDocument()
    expect(screen.getAllByText('Vị trí đã lưu')).toHaveLength(2)
  })

  it('sorts bookmarks by timestamp descending (most recent first)', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1, bookmark2] })
    renderPage()

    const titles = screen.getAllByRole('link').map((el) => el.textContent?.trim()).filter(Boolean)
    const bookmarkLinks = titles.filter((t) => t?.includes('Kinh'))
    expect(bookmarkLinks[0]).toContain('Kinh Bát Nhã')
    expect(bookmarkLinks[1]).toContain('Kinh Pháp Hoa')
  })

  it('BookmarkCard link navigates to correct URL', () => {
    useBookmarksStore.setState({ bookmarks: [bookmark1] })
    renderPage()

    const link = screen.getByRole('link', { name: /Kinh Pháp Hoa/ })
    expect(link).toHaveAttribute('href', '/read/kinh-phap-hoa')
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
