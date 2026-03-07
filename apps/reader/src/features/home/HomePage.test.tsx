import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import HomePage from '@/features/home/HomePage'

describe('HomePage', () => {
  it('renders stitch-aligned hero and quick links', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Trang Chủ' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tiếp tục đọc')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tiếp tục' })).toHaveAttribute('href', '/read/kinh-phap-hoa')
    expect(screen.getByRole('link', { name: 'Kinh Điển' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('link', { name: 'Dấu Trang' })).toHaveAttribute('href', '/bookmarks')
  })

  it('does not expose dead-end notification button', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'Thông báo' })).not.toBeInTheDocument()
  })
})
