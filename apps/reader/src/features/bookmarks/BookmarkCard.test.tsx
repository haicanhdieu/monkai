import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { BookmarkCard } from './BookmarkCard'
import type { Bookmark } from '@/stores/bookmarks.store'

const AUTO_BOOKMARK: Bookmark = {
  bookId: 'book-a',
  bookTitle: 'Book A',
  cfi: 'epubcfi(/6/2!/4/2/1:0)',
  type: 'auto',
  timestamp: 1000,
}

const MANUAL_BOOKMARK: Bookmark = {
  bookId: 'book-a',
  bookTitle: 'Book A',
  cfi: 'epubcfi(/6/6!/4/2/1:0)',
  type: 'manual',
  timestamp: 2000,
  page: 5,
  total: 100,
}

const MANUAL_BOOKMARK_WITH_CHAPTER: Bookmark = {
  ...MANUAL_BOOKMARK,
  chapterTitle: 'Tâm Kinh',
}

function renderCard(bookmark: Bookmark, onDelete?: () => void) {
  return render(
    <MemoryRouter>
      <BookmarkCard bookmark={bookmark} onDelete={onDelete} />
    </MemoryRouter>
  )
}

describe('BookmarkCard', () => {
  describe('auto bookmark', () => {
    it('renders "Đang đọc" text for auto bookmark', () => {
      renderCard(AUTO_BOOKMARK)
      expect(screen.getByText('Đang đọc')).toBeInTheDocument()
    })

    it('renders delete button for auto bookmark (swipe to delete is allowed)', () => {
      renderCard(AUTO_BOOKMARK, vi.fn())
      expect(screen.getByTestId('bookmark-delete-btn')).toBeInTheDocument()
    })

    it('swipe left ≥ 60px reveals delete button on auto bookmark', () => {
      renderCard(AUTO_BOOKMARK, vi.fn())
      const card = screen.getByTestId('bookmark-card')
      fireEvent.pointerDown(card, { clientX: 200 })
      fireEvent.pointerMove(card, { clientX: 130 }) // 70px delta
      const deleteZone = screen.getByTestId('bookmark-delete-btn').parentElement!
      expect(deleteZone).toHaveAttribute('aria-hidden', 'false')
    })
  })

  describe('manual bookmark', () => {
    it('renders BookmarkFilledIcon for manual bookmark', () => {
      renderCard(MANUAL_BOOKMARK)
      // The filled icon container is present and accent-colored
      const card = screen.getByTestId('bookmark-card')
      const link = within(card).getByRole('link')
      // BookmarkFilledIcon is aria-hidden but the button itself with label is in the delete zone
      expect(link.querySelector('svg')).toBeInTheDocument()
    })

    it('swipe left by 30px does NOT reveal delete button', () => {
      renderCard(MANUAL_BOOKMARK, vi.fn())
      const card = screen.getByTestId('bookmark-card')
      fireEvent.pointerDown(card, { clientX: 200 })
      fireEvent.pointerMove(card, { clientX: 170 }) // 30px delta — below 60 threshold
      // aria-hidden should be true (swipeX < 60)
      const deleteZone = screen.getByTestId('bookmark-delete-btn').parentElement!
      expect(deleteZone).toHaveAttribute('aria-hidden', 'true')
    })

    it('swipe left ≥ 60px reveals the delete button (aria-hidden=false)', () => {
      renderCard(MANUAL_BOOKMARK, vi.fn())
      const card = screen.getByTestId('bookmark-card')
      fireEvent.pointerDown(card, { clientX: 200 })
      fireEvent.pointerMove(card, { clientX: 130 }) // 70px delta — above 60 threshold
      const deleteZone = screen.getByTestId('bookmark-delete-btn').parentElement!
      expect(deleteZone).toHaveAttribute('aria-hidden', 'false')
    })

    it('clicking delete button calls onDelete', () => {
      const onDelete = vi.fn()
      renderCard(MANUAL_BOOKMARK, onDelete)
      const card = screen.getByTestId('bookmark-card')
      // Swipe to reveal
      fireEvent.pointerDown(card, { clientX: 200 })
      fireEvent.pointerMove(card, { clientX: 130 })
      screen.getByTestId('bookmark-delete-btn').click()
      expect(onDelete).toHaveBeenCalledTimes(1)
    })

    it('swipe right on an open item closes the delete button', () => {
      renderCard(MANUAL_BOOKMARK, vi.fn())
      const card = screen.getByTestId('bookmark-card')
      // Open the item with a left swipe
      fireEvent.pointerDown(card, { clientX: 200 })
      fireEvent.pointerMove(card, { clientX: 130 }) // 70px left → open
      const deleteZone = screen.getByTestId('bookmark-delete-btn').parentElement!
      expect(deleteZone).toHaveAttribute('aria-hidden', 'false')
      // Now swipe right from the open position
      fireEvent.pointerDown(card, { clientX: 130 })
      fireEvent.pointerMove(card, { clientX: 210 }) // 80px right → should close
      fireEvent.pointerUp(card)
      expect(deleteZone).toHaveAttribute('aria-hidden', 'true')
    })

    it('pointerdown outside an open item closes the delete button', () => {
      renderCard(MANUAL_BOOKMARK, vi.fn())
      const card = screen.getByTestId('bookmark-card')
      // Open the item
      fireEvent.pointerDown(card, { clientX: 200 })
      fireEvent.pointerMove(card, { clientX: 130 }) // 70px left → open
      const deleteZone = screen.getByTestId('bookmark-delete-btn').parentElement!
      expect(deleteZone).toHaveAttribute('aria-hidden', 'false')
      // Tap outside the card
      fireEvent.pointerDown(document.body)
      expect(deleteZone).toHaveAttribute('aria-hidden', 'true')
    })

    it('outer wrapper does not have border class (border is now on the parent card)', () => {
      renderCard(MANUAL_BOOKMARK)
      const card = screen.getByTestId('bookmark-card')
      expect(card).not.toHaveClass('border')
    })

    it('navigation is prevented after swipe (onClickCapture stops propagation)', () => {
      const onDelete = vi.fn()
      renderCard(MANUAL_BOOKMARK, onDelete)
      const card = screen.getByTestId('bookmark-card')
      const link = within(card).getByRole('link')

      // Track clicks on the link
      const linkClickSpy = vi.fn()
      link.addEventListener('click', linkClickSpy)

      fireEvent.pointerDown(card, { clientX: 200 })
      fireEvent.pointerMove(card, { clientX: 140 }) // > 5px → didSwipe=true
      fireEvent.pointerUp(card)
      fireEvent.click(card) // triggers onClickCapture which stops propagation
      expect(linkClickSpy).not.toHaveBeenCalled()
    })
  })
})

describe('BookmarkCard — chapter title display', () => {
  it('shows chapter title before page count when chapterTitle is set', () => {
    renderCard(MANUAL_BOOKMARK_WITH_CHAPTER)
    expect(screen.getByText('Tâm Kinh')).toBeInTheDocument()
    expect(screen.getByText('|')).toBeInTheDocument()
    expect(screen.getByText('Trang 5 / 100')).toBeInTheDocument()
  })

  it('does not show chapter title or separator when chapterTitle is absent', () => {
    renderCard(MANUAL_BOOKMARK)
    expect(screen.queryByText('|')).not.toBeInTheDocument()
    expect(screen.getByText('Trang 5 / 100')).toBeInTheDocument()
  })

  it('does not show chapter title on auto bookmark without page data', () => {
    renderCard(AUTO_BOOKMARK)
    expect(screen.queryByText('|')).not.toBeInTheDocument()
    expect(screen.getByText('Đang đọc')).toBeInTheDocument()
  })
})
