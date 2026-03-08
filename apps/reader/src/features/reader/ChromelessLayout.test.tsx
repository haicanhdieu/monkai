import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChromelessLayout } from '@/features/reader/ChromelessLayout'
import { useReaderStore } from '@/stores/reader.store'
import type { Book } from '@/shared/types/global.types'

const bookFixture: Book = {
  id: 'bat-nha',
  title: 'Kinh Bát Nhã',
  category: 'Kinh',
  subcategory: 'bat-nha',
  translator: 'HT. A',
  coverImageUrl: null,
  content: ['Đoạn 1.'],
}

function renderLayout(book = bookFixture) {
  return render(
    <MemoryRouter>
      <ChromelessLayout book={book} hasCoverPage>
        <div data-testid="reader-content">content</div>
      </ChromelessLayout>
    </MemoryRouter>,
  )
}

describe('ChromelessLayout', () => {
  beforeEach(() => {
    useReaderStore.getState().reset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // AC 1 — chrome visible: bars are visible
  it('renders top and bottom bars with full opacity when chrome is visible', () => {
    renderLayout()
    const topBar = screen.getByTestId('chrome-top-bar')
    const bottomBar = screen.getByTestId('chrome-bottom-bar')
    expect(topBar).toHaveStyle({ opacity: '1' })
    expect(bottomBar).toHaveStyle({ opacity: '1' })
  })

  // AC 1 — chrome hidden: bars have opacity 0 and pointer-events none
  it('hides top and bottom bars when isChromeVisible is false', () => {
    useReaderStore.setState({ isChromeVisible: false })
    renderLayout()
    const topBar = screen.getByTestId('chrome-top-bar')
    const bottomBar = screen.getByTestId('chrome-bottom-bar')
    expect(topBar).toHaveStyle({ opacity: '0', pointerEvents: 'none' })
    expect(bottomBar).toHaveStyle({ opacity: '0', pointerEvents: 'none' })
  })

  // AC 2 — center tap toggles chrome
  it('toggles chrome visibility when center zone is clicked', () => {
    renderLayout()
    expect(useReaderStore.getState().isChromeVisible).toBe(true)

    const zone = screen.getByTestId('center-tap-zone')
    act(() => {
      zone.click()
    })

    expect(useReaderStore.getState().isChromeVisible).toBe(false)
  })

  // AC 3 — hint is shown initially
  it('shows the first-open hint on initial render', () => {
    renderLayout()
    expect(screen.getByTestId('chrome-hint')).toBeInTheDocument()
    expect(screen.getByText('Chạm vào giữa màn hình để hiện menu')).toBeInTheDocument()
  })

  // AC 3 — chrome auto-hides after 3 seconds
  it('auto-hides chrome after 3 seconds on mount', () => {
    renderLayout()
    expect(useReaderStore.getState().isChromeVisible).toBe(true)

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(useReaderStore.getState().isChromeVisible).toBe(false)
  })

  // AC 3 — hint removed from DOM after first center-tap
  it('removes hint from DOM after first center-tap', () => {
    renderLayout()
    expect(screen.getByTestId('chrome-hint')).toBeInTheDocument()

    const zone = screen.getByTestId('center-tap-zone')
    act(() => {
      zone.click()
    })

    expect(screen.queryByTestId('chrome-hint')).not.toBeInTheDocument()
  })

  // AC 4 — book title shown in top bar
  it('renders book title in top bar', () => {
    renderLayout()
    expect(screen.getByText('Kinh Bát Nhã')).toBeInTheDocument()
  })

  // AC 4 — no text reflow: bars are fixed position, not in flow
  it('renders chrome bars as fixed-position overlays', () => {
    renderLayout()
    const topBar = screen.getByTestId('chrome-top-bar')
    // jsdom doesn't fully compute styles but we can check the class
    expect(topBar.className).toContain('fixed')
    const bottomBar = screen.getByTestId('chrome-bottom-bar')
    expect(bottomBar.className).toContain('fixed')
  })

  // AC 5 — ARIA semantics
  it('has role="navigation" on the top bar', () => {
    renderLayout()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  // Children are rendered
  it('renders children inside the layout', () => {
    renderLayout()
    expect(screen.getByTestId('reader-content')).toBeInTheDocument()
  })
})
