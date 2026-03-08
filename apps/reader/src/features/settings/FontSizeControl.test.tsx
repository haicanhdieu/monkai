import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FontSizeControl } from './FontSizeControl'

// Mock settings store
const mockSetFontSize = vi.fn()
let mockFontSize = 18

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: () => ({
    fontSize: mockFontSize,
    setFontSize: mockSetFontSize,
  }),
}))

// Mock Radix UI Slider to make it testable
vi.mock('@radix-ui/react-slider', () => ({
  Root: ({ children, onValueChange, value, min, max, step, 'aria-label': ariaLabel }: {
    children: React.ReactNode
    onValueChange?: (value: number[]) => void
    value?: number[]
    min?: number
    max?: number
    step?: number
    'aria-label'?: string
  }) => (
    <div
      data-testid="slider-root"
      data-min={min}
      data-max={max}
      data-step={step}
      data-value={JSON.stringify(value)}
      aria-label={ariaLabel}
    >
      <button
        data-testid="slider-trigger"
        onClick={() => onValueChange?.([20])}
      >
        slider
      </button>
      {children}
    </div>
  ),
  Track: ({ children }: { children: React.ReactNode }) => <div data-testid="slider-track">{children}</div>,
  Range: () => <div data-testid="slider-range" />,
  Thumb: () => <div data-testid="slider-thumb" />,
}))

describe('FontSizeControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFontSize = 18
  })

  it('renders slider with correct min/max/step/value from store', () => {
    render(<FontSizeControl />)

    const sliderRoot = screen.getByTestId('slider-root')
    expect(sliderRoot).toHaveAttribute('data-min', '14')
    expect(sliderRoot).toHaveAttribute('data-max', '28')
    expect(sliderRoot).toHaveAttribute('data-step', '2')
    expect(sliderRoot).toHaveAttribute('data-value', JSON.stringify([18]))
  })

  it('displays the current font size label', () => {
    render(<FontSizeControl />)
    expect(screen.getByText('18px')).toBeInTheDocument()
  })

  it('calls setFontSize with correct value when slider changes', async () => {
    const user = userEvent.setup()
    render(<FontSizeControl />)

    await user.click(screen.getByTestId('slider-trigger'))
    expect(mockSetFontSize).toHaveBeenCalledWith(20)
  })

  it('has accessible aria-label on slider', () => {
    render(<FontSizeControl />)
    expect(screen.getByTestId('slider-root')).toHaveAttribute('aria-label', 'Cỡ chữ')
  })
})
