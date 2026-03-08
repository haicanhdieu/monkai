import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from './ThemeToggle'

const mockSetTheme = vi.fn()
let mockTheme = 'sepia'

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
  }),
}))

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTheme = 'sepia'
  })

  it('renders three theme buttons', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /Vàng/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sáng/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tối/i })).toBeInTheDocument()
  })

  it('marks the active button as pressed matching store theme', () => {
    mockTheme = 'sepia'
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /Vàng/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Sáng/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /Tối/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls setTheme with correct value when clicking a button', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: /Tối/i }))
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('calls setTheme with light when Sáng button clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: /Sáng/i }))
    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })
})
