import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TocDrawer } from './TocDrawer'

const entries = [
  { label: 'Chương 1', href: 'chapter1.xhtml' },
  { label: 'Chương 2', href: 'chapter2.xhtml' },
]

describe('TocDrawer', () => {
  it('renders nothing when closed', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const { container } = render(
      <TocDrawer
        isOpen={false}
        entries={entries}
        isLoading={false}
        error={null}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders list when open with entries', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <TocDrawer
        isOpen
        entries={entries}
        isLoading={false}
        error={null}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )

    expect(screen.getByTestId('toc-drawer')).toBeInTheDocument()
    expect(screen.getByText('Chương 1')).toBeInTheDocument()
  })

  it('shows empty message when no entries', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <TocDrawer
        isOpen
        entries={[]}
        isLoading={false}
        error={null}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('Không có mục lục')).toBeInTheDocument()
  })

  it('shows loading message when loading', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <TocDrawer
        isOpen
        entries={[]}
        isLoading
        error={null}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('Đang tải mục lục...')).toBeInTheDocument()
  })

  it('shows error message when error present', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <TocDrawer
        isOpen
        entries={[]}
        isLoading={false}
        error={new Error('failed')}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('Không tải được mục lục')).toBeInTheDocument()
  })

  it('calls onClose when overlay is clicked', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <TocDrawer
        isOpen
        entries={entries}
        isLoading={false}
        error={null}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )

    const overlay = screen.getByLabelText('Đóng mục lục')
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })
})

