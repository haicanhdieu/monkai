import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BookCover } from './BookCover'

vi.mock('@/shared/services/data.service', () => ({
  resolveCoverUrl: (url: string | null) => url,
}))

describe('BookCover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows generated cover when coverImageUrl is null', () => {
    render(<BookCover id="book-1" title="Kinh A Di Đà" coverImageUrl={null} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByTestId('generated-cover')).toBeInTheDocument()
  })

  it('shows img when coverImageUrl is provided', () => {
    const { container } = render(
      <BookCover id="book-1" title="Kinh A Di Đà" coverImageUrl="https://example.com/cover.jpg" />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg')
  })

  it('falls back to generated cover when image load fails', () => {
    const { container } = render(
      <BookCover id="book-1" title="Kinh A Di Đà" coverImageUrl="https://example.com/broken.jpg" />,
    )
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('generated-cover')).toBeInTheDocument()
  })

  it('generated covers for different IDs have distinct gradients', () => {
    const { rerender } = render(<BookCover id="book-aaa" title="A" coverImageUrl={null} />)
    const style1 = screen.getByTestId('generated-cover').getAttribute('style')

    rerender(<BookCover id="book-zzz" title="A" coverImageUrl={null} />)
    const style2 = screen.getByTestId('generated-cover').getAttribute('style')

    expect(style1).not.toEqual(style2)
  })

  it('generated cover for same ID is always the same gradient', () => {
    const { rerender } = render(<BookCover id="same-id" title="A" coverImageUrl={null} />)
    const style1 = screen.getByTestId('generated-cover').getAttribute('style')

    rerender(<BookCover id="same-id" title="B" coverImageUrl={null} />)
    const style2 = screen.getByTestId('generated-cover').getAttribute('style')

    expect(style1).toEqual(style2)
  })

  it('shows full title on generated cover', () => {
    render(<BookCover id="book-1" title="Kinh A Di Đà" coverImageUrl={null} />)
    expect(screen.getByText('Kinh A Di Đà')).toBeInTheDocument()
  })

  it('shows fallback when title is empty', () => {
    render(<BookCover id="book-1" title="" coverImageUrl={null} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('truncates long titles in the middle with ellipsis', () => {
    const longTitle = 'Kinh Đại Bát Niết Bàn Phẩm Thứ Nhất Ca Diếp Bồ Tát Hỏi Phật'
    render(<BookCover id="book-1" title={longTitle} coverImageUrl={null} />)
    const span = screen.getByTestId('generated-cover').querySelector('span')!
    expect(span.textContent).toContain('…')
    expect(span.textContent!.length).toBeLessThanOrEqual(40)
  })
})
