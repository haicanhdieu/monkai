import '@testing-library/jest-dom'
import { vi } from 'vitest'

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

// @tanstack/react-virtual requires real DOM dimensions (scroll element size, getBoundingClientRect).
// In JSDOM all layout values are 0 and document.querySelector('main') returns null,
// so mock the virtualizer to render all items unconditionally.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, scrollMargin = 0 }: { count: number; scrollMargin?: number; [key: string]: unknown }) => ({
    getTotalSize: () => count * 116,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        key: i,
        index: i,
        start: scrollMargin + i * 116,
        size: 116,
      })),
    measureElement: () => undefined,
    options: { scrollMargin },
  }),
}))
