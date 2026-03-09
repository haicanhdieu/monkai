import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import ReaderErrorPage from '@/features/reader/ReaderErrorPage'

function renderReaderErrorPage(props: { category?: 'network' | 'parse' | 'not_found' | 'unknown'; isOffline?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <ReaderErrorPage {...props} />
    </MemoryRouter>,
  )
}

describe('ReaderErrorPage', () => {
  it('shows network message and back-to-library link by default', () => {
    renderReaderErrorPage({ category: 'network' })
    expect(
      screen.getByText('Nội dung này chưa được tải về. Vui lòng kết nối mạng và thử lại.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('back-to-library')).toBeInTheDocument()
  })

  it('shows offline guidance when category is network and isOffline is true', () => {
    renderReaderErrorPage({ category: 'network', isOffline: true })
    expect(
      screen.getByText(
        'Sách này chưa có trong bộ nhớ đệm. Hãy kết nối mạng, mở sách một lần, sau đó bạn có thể đọc offline.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByTestId('back-to-library')).toBeInTheDocument()
  })

  it('does not show offline guidance when category is network but isOffline is false', () => {
    renderReaderErrorPage({ category: 'network', isOffline: false })
    expect(
      screen.getByText('Nội dung này chưa được tải về. Vui lòng kết nối mạng và thử lại.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Sách này chưa có trong bộ nhớ đệm/),
    ).not.toBeInTheDocument()
  })

  it('shows not_found message for not_found category', () => {
    renderReaderErrorPage({ category: 'not_found' })
    expect(screen.getByText('Không thể tìm thấy nội dung kinh này.')).toBeInTheDocument()
  })

  it('shows parse message for parse category', () => {
    renderReaderErrorPage({ category: 'parse' })
    expect(screen.getByText('Nội dung kinh bị lỗi định dạng.')).toBeInTheDocument()
  })

  it('shows unknown message for unknown category', () => {
    renderReaderErrorPage({ category: 'unknown' })
    expect(screen.getByText('Không thể tải nội dung kinh này.')).toBeInTheDocument()
  })
})
