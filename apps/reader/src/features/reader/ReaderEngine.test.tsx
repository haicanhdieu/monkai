import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReaderEngine } from '@/features/reader/ReaderEngine'
import { storageService } from '@/shared/services/storage.service'
import { useReaderStore } from '@/stores/reader.store'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

vi.mock('@/shared/services/storage.service', () => ({
  storageService: {
    setItem: vi.fn().mockResolvedValue(undefined),
    getItem: vi.fn().mockResolvedValue(null),
  },
}))

const mockSetItem = vi.mocked(storageService.setItem)
const mockGetItem = vi.mocked(storageService.getItem)

describe('ReaderEngine — loading state', () => {
  it('shows skeleton when isReady is false and no error', () => {
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={null}
        book={null}
        isReady={false}
        error={null}
        bookId="book-1"
        bookTitle="Book One"
      />,
    )
    expect(screen.getByTestId('reader-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('epub-container')).toBeInTheDocument()
  })

  it('keeps epub container mounted during loading', () => {
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={null}
        book={null}
        isReady={false}
        error={null}
        bookId="book-1"
        bookTitle="Book One"
      />,
    )
    const container = screen.getByTestId('epub-container')
    expect(container).toBeInTheDocument()
  })

  it('hides epub container visually during loading', () => {
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={null}
        book={null}
        isReady={false}
        error={null}
        bookId="book-1"
        bookTitle="Book One"
      />,
    )
    const container = screen.getByTestId('epub-container')
    expect(container).toHaveStyle({ visibility: 'hidden' })
  })
})

describe('ReaderEngine — error state', () => {
  it('shows ReaderErrorPage when error is set', () => {
    renderWithRouter(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={null}
        book={null}
        isReady={false}
        error={new Error('failed')}
        bookId="book-1"
        bookTitle="Book One"
      />,
    )
    expect(screen.getByTestId('back-to-library')).toBeInTheDocument()
    expect(screen.queryByTestId('reader-skeleton')).not.toBeInTheDocument()
  })

  it('does not show skeleton when error is set', () => {
    renderWithRouter(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={null}
        book={null}
        isReady={false}
        error={new Error('load failed')}
        bookId="book-1"
        bookTitle="Book One"
      />,
    )
    expect(screen.queryByTestId('reader-skeleton')).not.toBeInTheDocument()
  })
})

describe('ReaderEngine — ready state', () => {
  it('shows epub container and hides skeleton when isReady is true', () => {
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={null}
        book={null}
        isReady={true}
        error={null}
        bookId="book-1"
        bookTitle="Book One"
      />,
    )
    expect(screen.getByTestId('epub-container')).toBeInTheDocument()
    expect(screen.queryByTestId('reader-skeleton')).not.toBeInTheDocument()
    const container = screen.getByTestId('epub-container')
    expect(container).toHaveStyle({ visibility: 'visible' })
  })
})

describe('ReaderEngine — accessibility', () => {
  it('has role=region with correct aria-label', () => {
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={null}
        book={null}
        isReady={true}
        error={null}
        bookId="book-1"
        bookTitle="Book One"
      />,
    )
    const region = screen.getByRole('region', { name: 'Nội dung kinh' })
    expect(region).toBeInTheDocument()
  })

  it('has aria-live region for location announcements', () => {
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={null}
        book={null}
        isReady={true}
        error={null}
        bookId="book-1"
        bookTitle="Book One"
      />,
    )
    const liveRegion = document.querySelector('[aria-live="polite"][aria-atomic="true"]')
    expect(liveRegion).toBeInTheDocument()
  })

  it('has region and aria-label in loading state', () => {
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={null}
        book={null}
        isReady={false}
        error={null}
        bookId="book-1"
        bookTitle="Book One"
      />,
    )
    expect(screen.getByRole('region', { name: 'Nội dung kinh' })).toBeInTheDocument()
  })
})

describe('ReaderEngine — themes and font size (Story 3.3)', () => {
  it('applies theme and fontSize to rendition when rendition is set', () => {
    const themes = { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() }
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={{
          on: vi.fn(),
          off: vi.fn(),
          themes,
          display: vi.fn().mockResolvedValue(undefined),
        } as never}
        book={{} as never}
        isReady={true}
        error={null}
        bookId="b1"
        bookTitle="Book"
      />,
    )
    expect(themes.select).toHaveBeenCalledWith('theme-sepia')
    expect(themes.fontSize).toHaveBeenCalledWith('18px')
  })
})

describe('ReaderEngine — tap navigation zones', () => {
  it('renders tap-prev and tap-next zones when rendition is set', () => {
    const mockRendition = {
      on: vi.fn(),
      off: vi.fn(),
      prev: vi.fn().mockResolvedValue(undefined),
      next: vi.fn().mockResolvedValue(undefined),
      display: vi.fn().mockResolvedValue(undefined),
      themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
    }
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={mockRendition as never}
        book={{} as never}
        isReady={true}
        error={null}
        bookId="b1"
        bookTitle="Book"
      />,
    )
    expect(screen.getByTestId('tap-prev')).toBeInTheDocument()
    expect(screen.getByTestId('tap-next')).toBeInTheDocument()
  })

  it('does not render tap zones when rendition is null', () => {
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={null}
        book={null}
        isReady={false}
        error={null}
        bookId="b1"
        bookTitle="Book"
      />,
    )
    expect(screen.queryByTestId('tap-prev')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tap-next')).not.toBeInTheDocument()
  })

  it('clicking tap-prev calls rendition.prev()', () => {
    const mockPrev = vi.fn().mockResolvedValue(undefined)
    const mockNext = vi.fn().mockResolvedValue(undefined)
    const mockRendition = {
      on: vi.fn(),
      off: vi.fn(),
      prev: mockPrev,
      next: mockNext,
      display: vi.fn().mockResolvedValue(undefined),
      themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
    }
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={mockRendition as never}
        book={{} as never}
        isReady={true}
        error={null}
        bookId="b1"
        bookTitle="Book"
      />,
    )
    fireEvent.click(screen.getByTestId('tap-prev'))
    expect(mockPrev).toHaveBeenCalledOnce()
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('clicking tap-next calls rendition.next()', () => {
    const mockPrev = vi.fn().mockResolvedValue(undefined)
    const mockNext = vi.fn().mockResolvedValue(undefined)
    const mockRendition = {
      on: vi.fn(),
      off: vi.fn(),
      prev: mockPrev,
      next: mockNext,
      display: vi.fn().mockResolvedValue(undefined),
      themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
    }
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={mockRendition as never}
        book={{} as never}
        isReady={true}
        error={null}
        bookId="b1"
        bookTitle="Book"
      />,
    )
    fireEvent.click(screen.getByTestId('tap-next'))
    expect(mockNext).toHaveBeenCalledOnce()
    expect(mockPrev).not.toHaveBeenCalled()
  })
})

describe('ReaderEngine — progress persistence (Story 3.2)', () => {
  beforeEach(() => {
    useReaderStore.getState().reset()
    useBookmarksStore.getState().clear()
    mockSetItem.mockClear()
    mockGetItem.mockClear()
    mockGetItem.mockResolvedValue(null)
  })

  it('calls setCurrentCfi and storageService.setItem on relocated with CFI', async () => {
    const cfi = 'epubcfi(/6/2!/4/2/1:0)'
    let relocatedHandler: ((loc: { start: { cfi: string } }) => void) | null = null
    const mockRendition = {
      on: vi.fn((event: string, fn: (loc: { start: { cfi: string } }) => void) => {
        if (event === 'relocated') relocatedHandler = fn
      }),
      off: vi.fn(),
      display: vi.fn().mockResolvedValue(undefined),
      themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
    }
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={mockRendition as never}
        book={{} as never}
        isReady={true}
        error={null}
        bookId="book-123"
        bookTitle="My Book"
      />,
    )
    expect(relocatedHandler).not.toBeNull()
    await act(() => {
      relocatedHandler!({ start: { cfi } })
    })
    expect(useReaderStore.getState().currentCfi).toBe(cfi)
    expect(mockSetItem).toHaveBeenCalledWith(
      STORAGE_KEYS.LAST_READ_POSITION,
      expect.objectContaining({ bookId: 'book-123', cfi, bookTitle: 'My Book' }),
    )
  })

  it('calls rendition.display(savedCfi) when storage has saved position for this bookId', async () => {
    const savedCfi = 'epubcfi(/6/2!/4/2/1:0)'
    mockGetItem.mockResolvedValue({ bookId: 'book-123', cfi: savedCfi })

    const mockDisplay = vi.fn().mockResolvedValue(undefined)
    const mockRendition = {
      on: vi.fn(),
      off: vi.fn(),
      display: mockDisplay,
      themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
    }
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={mockRendition as never}
        book={{} as never}
        isReady={true}
        error={null}
        bookId="book-123"
        bookTitle="My Book"
      />,
    )

    await waitFor(() => {
      expect(mockGetItem).toHaveBeenCalledWith(STORAGE_KEYS.LAST_READ_POSITION)
      expect(mockDisplay).toHaveBeenCalledWith(savedCfi)
    })
  })

  it('calls rendition.display() with no args when no saved position', async () => {
    mockGetItem.mockResolvedValue(null)

    const mockDisplay = vi.fn().mockResolvedValue(undefined)
    const mockRendition = {
      on: vi.fn(),
      off: vi.fn(),
      display: mockDisplay,
      themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
    }
    render(
      <ReaderEngine
        containerRef={{ current: null }}
        rendition={mockRendition as never}
        book={{} as never}
        isReady={true}
        error={null}
        bookId="book-123"
        bookTitle="My Book"
      />,
    )

    await waitFor(() => {
      expect(mockDisplay).toHaveBeenCalledWith()
    })
  })

  describe('ReaderEngine — chapter title resolution', () => {
    beforeEach(() => {
      useReaderStore.getState().reset()
      mockSetItem.mockClear()
      mockGetItem.mockResolvedValue(null)
    })

    it('calls setProgress with resolved chapter title when book has matching TOC entry', async () => {
      const mockBook = {
        navigation: { toc: [{ label: 'Tâm Kinh', href: 'chapter1.xhtml' }] },
        packaging: { navPath: 'OEBPS/nav.xhtml' },
      }
      let relocatedHandler: ((loc: unknown) => void) | null = null
      const mockRendition = {
        on: vi.fn((event: string, fn: (loc: unknown) => void) => {
          if (event === 'relocated') relocatedHandler = fn
        }),
        off: vi.fn(),
        display: vi.fn().mockResolvedValue(undefined),
        themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
      }
      render(
        <ReaderEngine
          containerRef={{ current: null }}
          rendition={mockRendition as never}
          book={mockBook as never}
          isReady={true}
          error={null}
          bookId="book-1"
          bookTitle="My Book"
        />,
      )
      await act(() => {
        relocatedHandler!({
          start: {
            cfi: 'epubcfi(/6/2!/4/2/1:0)',
            href: 'OEBPS/chapter1.xhtml',
            displayed: { page: 3, total: 12 },
          },
        })
      })
      expect(useReaderStore.getState().currentChapterTitle).toBe('Tâm Kinh')
    })

    it('resolves to empty string when href does not match any TOC entry', async () => {
      const mockBook = {
        navigation: { toc: [{ label: 'Tâm Kinh', href: 'chapter1.xhtml' }] },
        packaging: { navPath: 'OEBPS/nav.xhtml' },
      }
      let relocatedHandler: ((loc: unknown) => void) | null = null
      const mockRendition = {
        on: vi.fn((event: string, fn: (loc: unknown) => void) => {
          if (event === 'relocated') relocatedHandler = fn
        }),
        off: vi.fn(),
        display: vi.fn().mockResolvedValue(undefined),
        themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
      }
      render(
        <ReaderEngine
          containerRef={{ current: null }}
          rendition={mockRendition as never}
          book={mockBook as never}
          isReady={true}
          error={null}
          bookId="book-1"
          bookTitle="My Book"
        />,
      )
      await act(() => {
        relocatedHandler!({
          start: {
            cfi: 'epubcfi(/6/4!/4/2/1:0)',
            href: 'OEBPS/chapter99.xhtml',
            displayed: { page: 1, total: 5 },
          },
        })
      })
      expect(useReaderStore.getState().currentChapterTitle).toBe('')
    })

    it('resolves to empty string when book is null', async () => {
      let relocatedHandler: ((loc: unknown) => void) | null = null
      const mockRendition = {
        on: vi.fn((event: string, fn: (loc: unknown) => void) => {
          if (event === 'relocated') relocatedHandler = fn
        }),
        off: vi.fn(),
        display: vi.fn().mockResolvedValue(undefined),
        themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
      }
      render(
        <ReaderEngine
          containerRef={{ current: null }}
          rendition={mockRendition as never}
          book={null}
          isReady={true}
          error={null}
          bookId="book-1"
          bookTitle="My Book"
        />,
      )
      await act(() => {
        relocatedHandler!({
          start: {
            cfi: 'epubcfi(/6/2!/4/2/1:0)',
            href: 'OEBPS/chapter1.xhtml',
            displayed: { page: 1, total: 5 },
          },
        })
      })
      expect(useReaderStore.getState().currentChapterTitle).toBe('')
    })
  })
})
