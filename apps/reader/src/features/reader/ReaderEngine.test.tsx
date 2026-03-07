import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReaderEngine } from '@/features/reader/ReaderEngine'
import { useReaderStore } from '@/stores/reader.store'

// JSDOM innerWidth defaults to 1024; tap zones use window.innerWidth
// Left zone:  clientX < 1024 * 0.2 = 204   (use 100)
// Right zone: clientX > 1024 * 0.8 = 819   (use 950)
// Center:     204 <= clientX <= 819          (use 512)
const LEFT_TAP = 100
const RIGHT_TAP = 950
const CENTER_TAP = 512

// Resolve document.fonts.ready immediately in all tests.
// Mock scrollHeight/clientHeight so DOM measurement produces predictable pages:
// scrollHeight (100) > clientHeight (90) means each paragraph triggers a new page.
beforeEach(() => {
  Object.defineProperty(document, 'fonts', {
    value: { ready: Promise.resolve() },
    configurable: true,
    writable: true,
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(90)
  useReaderStore.getState().reset()
})

// 50 paragraphs ensures multiple pages (capacity ~21/page with JSDOM innerHeight=768, fontSize=18, lineHeight=1.6, padding=80)
const PARAGRAPHS = Array.from({ length: 50 }, (_, i) => `Đoạn ${i + 1}.`)

/** Render engine and wait until fonts are ready and pages are computed. */
async function renderEngine(paragraphs = PARAGRAPHS, onCenterTap?: () => void) {
  render(<ReaderEngine paragraphs={paragraphs} onCenterTap={onCenterTap} />)
  // Wait until the skeleton disappears (fonts ready + pages computed)
  await waitFor(() => {
    expect(screen.queryByTestId('reader-skeleton')).not.toBeInTheDocument()
  })
}

describe('ReaderEngine — loading state', () => {
  it('shows skeleton before fonts are ready', () => {
    const neverResolve = new Promise<void>(() => {})
    Object.defineProperty(document, 'fonts', {
      value: { ready: neverResolve },
      configurable: true,
      writable: true,
    })
    render(<ReaderEngine paragraphs={PARAGRAPHS} />)
    expect(screen.getByTestId('reader-skeleton')).toBeInTheDocument()
  })
})

describe('ReaderEngine — rendering', () => {
  it('renders page content after fonts are ready', async () => {
    await renderEngine()
    expect(screen.getByTestId('reader-engine')).toBeInTheDocument()
    expect(screen.queryByTestId('reader-skeleton')).not.toBeInTheDocument()
  })

  it('shows page progress indicator', async () => {
    await renderEngine()
    expect(screen.getByTestId('page-progress')).toBeInTheDocument()
  })

  it('has role="region" and aria-live="polite" on text column (AC 5 of 3.4)', async () => {
    await renderEngine()
    const col = screen.getByTestId('reader-text-column')
    // role="region" (not "main") so only one main landmark exists per page (MED-1 code review fix)
    expect(col).toHaveAttribute('role', 'region')
    expect(col).toHaveAttribute('aria-live', 'polite')
  })

  it('applies robust word wrapping to paragraph text', async () => {
    await renderEngine(['x'.repeat(300)])
    const paragraph = screen.getByText('x'.repeat(300))
    expect(paragraph).toHaveStyle({ overflowWrap: 'anywhere' })
    expect(paragraph).toHaveStyle({ wordBreak: 'break-word' })
  })
})

describe('ReaderEngine — empty content (AC 3 of 3.5)', () => {
  it('shows empty content message for zero paragraphs without crashing', async () => {
    await renderEngine([])
    expect(screen.getByTestId('reader-engine')).toBeInTheDocument()
    expect(screen.getByText('Nội dung trống.')).toBeInTheDocument()
  })
})

describe('ReaderEngine — tap zone navigation (AC 2, 3, 4 of 3.3)', () => {
  it('navigates to next page on right-zone tap', async () => {
    await renderEngine()
    fireEvent.click(screen.getByTestId('reader-engine'), { clientX: RIGHT_TAP })
    expect(useReaderStore.getState().currentPage).toBeGreaterThan(0)
  })

  it('navigates to prev page on left-zone tap after advancing', async () => {
    await renderEngine()
    const engine = screen.getByTestId('reader-engine')

    fireEvent.click(engine, { clientX: RIGHT_TAP })
    const afterForward = useReaderStore.getState().currentPage
    expect(afterForward).toBeGreaterThan(0)

    fireEvent.click(engine, { clientX: LEFT_TAP })
    expect(useReaderStore.getState().currentPage).toBeLessThan(afterForward)
  })

  it('stays on page 0 when tapping left on first page (AC 3)', async () => {
    await renderEngine()
    fireEvent.click(screen.getByTestId('reader-engine'), { clientX: LEFT_TAP })
    expect(useReaderStore.getState().currentPage).toBe(0)
  })

  it('stays on last page when tapping right on last page (AC 4)', async () => {
    await renderEngine()
    const engine = screen.getByTestId('reader-engine')

    // Tap enough times to guarantee reaching the last page regardless of page count
    for (let i = 0; i < 100; i++) {
      fireEvent.click(engine, { clientX: RIGHT_TAP })
    }
    const { currentPage, pages } = useReaderStore.getState()
    expect(currentPage).toBe(pages.length - 1)
  })

  it('calls onCenterTap when center zone is tapped', async () => {
    const onCenterTap = vi.fn()
    await renderEngine(PARAGRAPHS, onCenterTap)
    fireEvent.click(screen.getByTestId('reader-engine'), { clientX: CENTER_TAP })
    expect(onCenterTap).toHaveBeenCalledOnce()
  })
})

describe('ReaderEngine — keyboard navigation (AC 6 of 3.3)', () => {
  it('navigates to next page on ArrowRight key', async () => {
    await renderEngine()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useReaderStore.getState().currentPage).toBeGreaterThan(0)
  })

  it('navigates to next page on PageDown key', async () => {
    await renderEngine()
    fireEvent.keyDown(window, { key: 'PageDown' })
    expect(useReaderStore.getState().currentPage).toBeGreaterThan(0)
  })

  it('navigates to prev page on ArrowLeft after advancing', async () => {
    await renderEngine()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    const after = useReaderStore.getState().currentPage
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(useReaderStore.getState().currentPage).toBeLessThan(after)
  })

  it('navigates to prev page on PageUp after advancing', async () => {
    await renderEngine()
    fireEvent.keyDown(window, { key: 'PageDown' })
    const after = useReaderStore.getState().currentPage
    fireEvent.keyDown(window, { key: 'PageUp' })
    expect(useReaderStore.getState().currentPage).toBeLessThan(after)
  })
})

describe('ReaderEngine — swipe navigation', () => {
  it('navigates next on swipe left', async () => {
    await renderEngine()
    const engine = screen.getByTestId('reader-engine')

    fireEvent.touchStart(engine, { touches: [{ clientX: 300 }] })
    fireEvent.touchEnd(engine, { changedTouches: [{ clientX: 200 }] }) // delta -100 → next

    expect(useReaderStore.getState().currentPage).toBeGreaterThan(0)
  })

  it('navigates prev on swipe right', async () => {
    await renderEngine()
    const engine = screen.getByTestId('reader-engine')

    // Advance first
    fireEvent.touchStart(engine, { touches: [{ clientX: 300 }] })
    fireEvent.touchEnd(engine, { changedTouches: [{ clientX: 200 }] })
    const after = useReaderStore.getState().currentPage

    // Swipe right to go back
    fireEvent.touchStart(engine, { touches: [{ clientX: 200 }] })
    fireEvent.touchEnd(engine, { changedTouches: [{ clientX: 300 }] }) // delta +100 → prev

    expect(useReaderStore.getState().currentPage).toBeLessThan(after)
  })
})

describe('ReaderEngine — page progress (AC 7 of 3.3)', () => {
  it('shows 1 / N on first page', async () => {
    await renderEngine()
    const progress = screen.getByTestId('page-progress')
    expect(progress.textContent).toMatch(/^1 \/ \d+$/)
  })
})
