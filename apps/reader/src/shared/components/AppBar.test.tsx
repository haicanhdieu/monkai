import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppBar } from '@/shared/components/AppBar'
import { ROUTES } from '@/shared/constants/routes'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('AppBar', () => {
  it('renders title only with data-testid', () => {
    renderWithRouter(<AppBar title="Trang Chủ" />)
    expect(screen.getByTestId('app-bar')).toBeInTheDocument()
    expect(screen.getByRole('banner', { name: 'Trang Chủ' })).toBeInTheDocument()
    expect(screen.getByText('Trang Chủ')).toBeInTheDocument()
  })

  it('renders back link when backTo is set', () => {
    renderWithRouter(<AppBar title="Thể loại" backTo={ROUTES.LIBRARY} />)
    const link = screen.getByRole('link', { name: 'Quay lại thư viện' })
    expect(link).toHaveAttribute('href', ROUTES.LIBRARY)
    expect(link).toHaveTextContent('← Thư viện')
  })

  it('renders custom backLabel when backTo is set', () => {
    renderWithRouter(
      <AppBar title="Chi tiết" backTo={ROUTES.HOME} backLabel="Trang Chủ" />,
    )
    expect(screen.getByText('← Trang Chủ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quay lại trang chủ' })).toBeInTheDocument()
  })

  it('applies titleClassName to the title when provided', () => {
    renderWithRouter(<AppBar title="Cài Đặt" titleClassName="font-serif" />)
    const heading = screen.getByRole('heading', { name: 'Cài Đặt' })
    expect(heading).toHaveClass('font-serif')
  })

  it('renders leftIcon when provided', () => {
    renderWithRouter(
      <AppBar title="Thư Viện" leftIcon={<span data-testid="left-icon">☰</span>} />,
    )
    expect(screen.getByTestId('left-icon')).toBeInTheDocument()
    expect(screen.getByText('Thư Viện')).toBeInTheDocument()
  })

  it('renders rightSlot when provided', () => {
    renderWithRouter(
      <AppBar title="Cài Đặt" rightSlot={<span data-testid="right-slot">Save</span>} />,
    )
    expect(screen.getByTestId('right-slot')).toHaveTextContent('Save')
  })

  it('uses page background color in non-sticky mode', () => {
    renderWithRouter(<AppBar title="Trang Chủ" />)
    const header = screen.getByTestId('app-bar')
    expect(header).toHaveStyle({ backgroundColor: 'var(--color-background)' })
  })

  it('applies sticky classes when sticky is true', () => {
    renderWithRouter(<AppBar title="Thư Viện" sticky />)
    const header = screen.getByTestId('app-bar')
    expect(header.className).toContain('sticky')
    expect(header.className).toContain('backdrop-blur')
    expect(header).toHaveStyle({ backgroundColor: 'var(--color-background)' })
  })

  it('renders children below title row', () => {
    renderWithRouter(
      <AppBar title="Thư Viện">
        <p data-testid="child-content">Search hub here</p>
      </AppBar>,
    )
    expect(screen.getByTestId('child-content')).toHaveTextContent('Search hub here')
  })
})
