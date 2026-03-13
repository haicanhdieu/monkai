import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TocList } from './TocList'

const entries = [
  { label: 'Chương 1', href: 'chapter1.xhtml' },
  { label: 'Chương 2', href: 'chapter2.xhtml' },
]

describe('TocList', () => {
  it('renders entries', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<TocList entries={entries} onSelect={onSelect} onClose={onClose} />)

    expect(screen.getByTestId('toc-list')).toBeInTheDocument()
    expect(screen.getByText('Chương 1')).toBeInTheDocument()
    expect(screen.getByText('Chương 2')).toBeInTheDocument()
  })

  it('calls onSelect when an entry is clicked', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<TocList entries={entries} onSelect={onSelect} onClose={onClose} />)

    fireEvent.click(screen.getByText('Chương 1'))
    expect(onSelect).toHaveBeenCalledWith(entries[0])
  })

  it('calls onClose when Escape is pressed', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<TocList entries={entries} onSelect={onSelect} onClose={onClose} />)

    const list = screen.getByTestId('toc-list')
    fireEvent.keyDown(list, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

