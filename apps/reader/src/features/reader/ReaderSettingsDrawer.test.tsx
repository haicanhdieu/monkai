import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReaderSettingsDrawer } from './ReaderSettingsDrawer'
import type { ReadingTheme } from '@/stores/settings.store'

const mockSetFontSize = vi.fn()
const mockSetTheme = vi.fn()
let mockFontSize = 18
let mockTheme: ReadingTheme = 'sepia'

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: () => ({
    fontSize: mockFontSize,
    theme: mockTheme,
    setFontSize: mockSetFontSize,
    setTheme: mockSetTheme,
  }),
  FONT_SIZE_MIN: 14,
  FONT_SIZE_MAX: 28,
}))

describe('ReaderSettingsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFontSize = 18 // reset before each test
    mockTheme = 'sepia' // reset before each test
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ReaderSettingsDrawer isOpen={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders drawer when isOpen is true', () => {
    render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
    expect(screen.getByTestId('settings-drawer')).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<ReaderSettingsDrawer isOpen onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Đóng cài đặt'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when header close button is clicked', () => {
    const onClose = vi.fn()
    render(<ReaderSettingsDrawer isOpen onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Đóng cài đặt hiển thị'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<ReaderSettingsDrawer isOpen onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape does not reach a bubble listener (stopPropagation)', () => {
    const onClose = vi.fn()
    const bubbleSpy = vi.fn()
    render(<ReaderSettingsDrawer isOpen onClose={onClose} />)
    window.addEventListener('keydown', bubbleSpy)
    fireEvent.keyDown(window, { key: 'Escape' })
    window.removeEventListener('keydown', bubbleSpy)
    expect(onClose).toHaveBeenCalled()
    expect(bubbleSpy).not.toHaveBeenCalled()
  })

  it('displays current fontSize from store', () => {
    render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
    expect(screen.getByTestId('font-size-value')).toHaveTextContent('18px')
  })

  it('calls setFontSize with fontSize+2 when A+ clicked', async () => {
    const user = userEvent.setup()
    render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
    await user.click(screen.getByTestId('font-increase'))
    expect(mockSetFontSize).toHaveBeenCalledWith(20)
  })

  it('calls setFontSize with fontSize-2 when A− clicked', async () => {
    const user = userEvent.setup()
    render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
    await user.click(screen.getByTestId('font-decrease'))
    expect(mockSetFontSize).toHaveBeenCalledWith(16)
  })

  it('A+ button is disabled when fontSize is at max (28)', () => {
    mockFontSize = 28
    render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
    expect(screen.getByTestId('font-increase')).toBeDisabled()
  })

  it('A− button is disabled when fontSize is at min (14)', () => {
    mockFontSize = 14
    render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
    expect(screen.getByTestId('font-decrease')).toBeDisabled()
  })

  it('renders three theme buttons', () => {
    render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
    expect(screen.getByLabelText('Giao diện Vàng')).toBeInTheDocument()
    expect(screen.getByLabelText('Giao diện Sáng')).toBeInTheDocument()
    expect(screen.getByLabelText('Giao diện Tối')).toBeInTheDocument()
  })

  it('marks the active theme button as aria-pressed=true', () => {
    mockTheme = 'sepia'
    render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
    expect(screen.getByLabelText('Giao diện Vàng')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Giao diện Sáng')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Giao diện Tối')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls setTheme when theme button clicked', async () => {
    const user = userEvent.setup()
    render(<ReaderSettingsDrawer isOpen onClose={vi.fn()} />)
    await user.click(screen.getByLabelText('Giao diện Tối'))
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })
})
