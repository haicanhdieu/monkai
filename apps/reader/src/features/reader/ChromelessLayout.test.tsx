import { render, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChromelessLayout, CHROME_AUTOHIDE_MS } from '@/features/reader/ChromelessLayout'
import { useReaderStore } from '@/stores/reader.store'
import type { Book } from '@/shared/types/global.types'
import { ROUTES } from '@/shared/constants/routes'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

let savedHistory: History | undefined

const bookFixture: Book = {
  id: 'bat-nha',
  title: 'Kinh Bát Nhã',
  category: 'Kinh',
  subcategory: 'bat-nha',
  translator: 'HT. A',
  coverImageUrl: null,
  content: ['Đoạn 1.'],
}

function renderLayout(
  book = bookFixture,
  opts: {
    getToc?: () => Promise<{ label: string; href: string }[]>
    navigateToTocEntry?: (entry: { label: string; href: string }) => Promise<void>
  } = {},
) {
  return render(
    <MemoryRouter>
      <ChromelessLayout book={book} hasCoverPage getToc={opts.getToc} navigateToTocEntry={opts.navigateToTocEntry}>
        <div data-testid="reader-content">content</div>
      </ChromelessLayout>
    </MemoryRouter>,
  )
}

describe('ChromelessLayout', () => {
  beforeEach(() => {
    useReaderStore.getState().reset()
    vi.useFakeTimers()
    mockNavigate.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (savedHistory !== undefined) {
      Object.defineProperty(window, 'history', {
        value: savedHistory,
        writable: true,
        configurable: true,
      })
      savedHistory = undefined
    }
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
    expect(screen.getByText('Menu')).toBeInTheDocument()
    expect(screen.getByText('Trang trước')).toBeInTheDocument()
    expect(screen.getByText('Trang tiếp')).toBeInTheDocument()
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

  // AC 3.3a — hint auto-hides after CHROME_AUTOHIDE_MS
  it('auto-hides hint after CHROME_AUTOHIDE_MS ms', () => {
    renderLayout()
    expect(screen.getByTestId('chrome-hint')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(CHROME_AUTOHIDE_MS) })
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

  // Back control: navigate(-1) when history has more than one entry
  it('calls navigate(-1) when back is clicked and history.length > 1', () => {
    savedHistory = window.history
    Object.defineProperty(window, 'history', {
      value: { length: 2 },
      writable: true,
      configurable: true,
    })
    renderLayout()
    const backControl = screen.getByRole('button', { name: 'Về Thư viện' })
    act(() => {
      backControl.click()
    })
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  // Back control: fallback to Library when history.length is 1
  it('navigates to Library when back is clicked and history.length is 1', () => {
    savedHistory = window.history
    Object.defineProperty(window, 'history', {
      value: { length: 1 },
      writable: true,
      configurable: true,
    })
    renderLayout()
    const backControl = screen.getByRole('button', { name: 'Về Thư viện' })
    act(() => {
      backControl.click()
    })
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.LIBRARY)
  })

  // TODO: epub.js rewrite in Story 2.2 — page count display uses CFI-based progress
  // ChromelessLayout now stubs currentPage=0 and pages=[] pending epub.js rewrite
  it.skip('displays page count without cover offset when hasCoverPage is false (TODO: Story 2.2)', () => {
    render(
      <MemoryRouter>
        <ChromelessLayout book={bookFixture} hasCoverPage={false}>
          <div />
        </ChromelessLayout>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('chrome-bottom-bar')).toHaveTextContent('1 / 2')
  })

  it('shows TOC trigger when getToc and navigateToTocEntry are provided', () => {
    renderLayout(bookFixture, {
      getToc: async () => [],
      navigateToTocEntry: async () => {},
    })
    expect(screen.getByTestId('toc-trigger')).toBeInTheDocument()
  })

  it('does not show TOC trigger when getToc or navigateToTocEntry is missing', () => {
    renderLayout(bookFixture)
    expect(screen.queryByTestId('toc-trigger')).not.toBeInTheDocument()
  })

  it('opens drawer and shows "Không có mục lục" when getToc returns empty array', async () => {
    vi.useRealTimers()
    renderLayout(bookFixture, {
      getToc: async () => [],
      navigateToTocEntry: async () => {},
    })
    const trigger = screen.getByTestId('toc-trigger')
    await act(async () => {
      trigger.click()
    })
    await waitFor(() => {
      expect(screen.getByTestId('toc-drawer')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText('Không có mục lục')).toBeInTheDocument()
    })
    vi.useFakeTimers()
  })
})
