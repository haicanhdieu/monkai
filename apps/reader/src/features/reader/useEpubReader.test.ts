import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import ePub from 'epubjs' // eslint-disable-line no-restricted-imports -- mock only
import { render, renderHook, waitFor } from '@testing-library/react'
import { useEpubReader } from './useEpubReader'

vi.mock('epubjs', () => ({
  __esModule: true,
  default: vi.fn(() => ({})),
}))

describe('useEpubReader TOC API', () => {
  it('returns empty array when navigation.toc is missing', async () => {
    const mockBook = {
      navigation: { toc: [] },
      on: vi.fn(),
      destroy: vi.fn(),
      renderTo: vi.fn(() => ({
        themes: { register: vi.fn(), select: vi.fn(), fontSize: vi.fn() },
        display: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      })),
    }

    vi.mocked(ePub).mockReturnValue(mockBook as never)

    const { result } = renderHook(() => useEpubReader('/book.epub'))

    const toc = await result.current.getToc()
    expect(toc).toEqual([])
  })

  it('returns empty array when book is null', async () => {
    vi.mocked(ePub).mockReturnValue(null as never)
    const { result } = renderHook(() => useEpubReader(null))
    const toc = await result.current.getToc()
    expect(toc).toEqual([])
  })

  it('flattens toc with navPath and subitems and resolves hrefs', async () => {
    const mockBook = {
      destroy: vi.fn(),
      navigation: {
        toc: [
          { label: 'Chương 1', href: 'ch1.xhtml' },
          {
            label: 'Phần 2',
            href: 'part2.xhtml',
            subitems: [
              { label: 'Chương 2.1', href: 'ch2_1.xhtml' },
              { label: 'Chương 2.2', href: 'ch2_2.xhtml' },
            ],
          },
        ],
      },
      packaging: { navPath: 'OEBPS/nav.xhtml', ncxPath: '' },
      on: vi.fn(),
      renderTo: vi.fn(() => ({
        themes: { register: vi.fn(), select: vi.fn(), fontSize: vi.fn() },
        display: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      })),
    }
    vi.mocked(ePub).mockReturnValue(mockBook as never)

    const hookResultRef = { current: null as ReturnType<typeof useEpubReader> | null }
    function Wrapper() {
      const r = useEpubReader('/book.epub')
      hookResultRef.current = r
      return React.createElement('div', {
        ref: r.containerRef,
        style: { width: 100, height: 100 },
      })
    }
    const { unmount } = render(React.createElement(Wrapper))
    await waitFor(() => {
      expect(hookResultRef.current?.book).not.toBeNull()
    })
    const toc = await hookResultRef.current!.getToc()
    expect(toc).toHaveLength(4)
    expect(toc[0]).toEqual({ label: 'Chương 1', href: 'OEBPS/ch1.xhtml' })
    expect(toc[1]).toEqual({ label: 'Phần 2', href: 'OEBPS/part2.xhtml' })
    expect(toc[2]).toEqual({ label: 'Chương 2.1', href: 'OEBPS/ch2_1.xhtml' })
    expect(toc[3]).toEqual({ label: 'Chương 2.2', href: 'OEBPS/ch2_2.xhtml' })
    unmount()
  })

  it('returns empty array on malformed navigation (no throw)', async () => {
    const mockBook = {
      navigation: { toc: undefined },
      on: vi.fn(),
      destroy: vi.fn(),
      renderTo: vi.fn(() => ({
        themes: { register: vi.fn(), select: vi.fn(), fontSize: vi.fn() },
        display: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      })),
    }
    vi.mocked(ePub).mockReturnValue(mockBook as never)
    const hookResultRef = { current: null as ReturnType<typeof useEpubReader> | null }
    function Wrapper() {
      const r = useEpubReader('/book.epub')
      hookResultRef.current = r
      return React.createElement('div', {
        ref: r.containerRef,
        style: { width: 100, height: 100 },
      })
    }
    render(React.createElement(Wrapper))
    await waitFor(() => {
      expect(hookResultRef.current?.book).not.toBeNull()
    })
    const toc = await hookResultRef.current!.getToc()
    expect(toc).toEqual([])
  })
})

