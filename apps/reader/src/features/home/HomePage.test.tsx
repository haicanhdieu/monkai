import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, beforeEach } from 'vitest'
import HomePage from '@/features/home/HomePage'
import { useReaderStore } from '@/stores/reader.store'

function renderHomePage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useReaderStore.setState({
    lastReadBookId: '',
    lastReadBookTitle: '',
    lastReadPage: 0,
    lastReadTotalPages: 0,
  })
})

describe('HomePage', () => {
  it('renders page heading and quick links', () => {
    renderHomePage()

    expect(screen.getByRole('heading', { name: 'Trang Chủ' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kinh Điển' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('link', { name: 'Dấu Trang' })).toHaveAttribute('href', '/bookmarks')
  })

  it('does not show "Continue Reading" section when no last read position', () => {
    useReaderStore.setState({ lastReadBookId: '', lastReadPage: 0 })
    renderHomePage()

    expect(screen.queryByLabelText('Tiếp tục đọc')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Tiếp tục đọc/ })).not.toBeInTheDocument()
  })

  it('shows "Continue Reading" card with correct link when last read position exists', () => {
    useReaderStore.setState({
      lastReadBookId: 'kinh-phap-hoa',
      lastReadBookTitle: 'Kinh Pháp Hoa',
      lastReadPage: 15,
      lastReadTotalPages: 99,
    })
    renderHomePage()

    expect(screen.getByLabelText('Tiếp tục đọc')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Tiếp tục đọc Kinh Pháp Hoa/ }),
    ).toHaveAttribute('href', '/read/kinh-phap-hoa')
    expect(screen.getByText('Kinh Pháp Hoa')).toBeInTheDocument()
    expect(screen.getAllByText(/Trang 15/).length).toBeGreaterThanOrEqual(1)
  })

  it('does not expose dead-end notification button', () => {
    renderHomePage()

    expect(screen.queryByRole('button', { name: 'Thông báo' })).not.toBeInTheDocument()
  })
})
