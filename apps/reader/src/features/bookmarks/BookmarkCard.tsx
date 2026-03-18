import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookmarkFilledIcon, UpdateIcon } from '@radix-ui/react-icons'
import { toRead } from '@/shared/constants/routes'
import { formatRelativeTime } from '@/shared/utils/time'
import type { Bookmark } from '@/stores/bookmarks.store'

interface BookmarkCardProps {
  bookmark: Bookmark
  onDelete?: () => void
}

export function BookmarkCard({ bookmark, onDelete }: BookmarkCardProps) {
  const [swipeX, setSwipeX] = useState(0)
  const startXRef = useRef(0)
  const didSwipeRef = useRef(false)

  const isManual = bookmark.type === 'manual'

  const resetSwipe = () => setSwipeX(0)

  const pointerHandlers = isManual
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          startXRef.current = e.clientX
          didSwipeRef.current = false
          // Capture pointer so onPointerMove keeps firing even when the finger leaves the element
          e.currentTarget.setPointerCapture?.(e.pointerId)
        },
        onPointerMove: (e: React.PointerEvent) => {
          const delta = startXRef.current - e.clientX
          if (delta > 5) didSwipeRef.current = true
          if (delta > 0) setSwipeX(Math.min(delta, 72))
        },
        onPointerUp: () => {
          if (swipeX < 60) setSwipeX(0)
        },
        onPointerLeave: () => {
          if (swipeX < 60) setSwipeX(0)
        },
        onPointerCancel: resetSwipe,
        onClickCapture: (e: React.MouseEvent) => {
          if (didSwipeRef.current) {
            const target = e.target as Element
            // Allow delete button clicks to proceed even after swipe
            if (!target.closest('[data-testid="bookmark-delete-btn"]')) {
              e.stopPropagation()
              e.preventDefault()
            }
            didSwipeRef.current = false
          }
        },
      }
    : {}

  return (
    <div
      data-testid="bookmark-card"
      className="relative overflow-hidden rounded-2xl"
      style={isManual ? { touchAction: 'pan-y' } : undefined}
      {...pointerHandlers}
    >
      {isManual && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center w-[72px]"
          style={{ backgroundColor: 'var(--color-error, #ef4444)' }}
          aria-hidden={swipeX < 60}
        >
          <button
            type="button"
            onClick={() => { setSwipeX(0); onDelete?.() }}
            aria-label="Xóa dấu trang"
            data-testid="bookmark-delete-btn"
            tabIndex={swipeX >= 60 ? 0 : -1}
            className="w-full h-full text-white text-xs font-medium"
          >
            Xóa
          </button>
        </div>
      )}
      <Link
        to={toRead(bookmark.bookId)}
        state={{ cfi: bookmark.cfi }}
        style={{
          transform: `translateX(-${swipeX}px)`,
          transition: swipeX === 0 ? 'transform 0.2s' : 'none',
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        className="relative flex min-h-[44px] gap-4 rounded-2xl border p-4 transition-colors hover:brightness-95"
      >
        <div className="min-w-0 flex-1 flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {isManual ? (
            <BookmarkFilledIcon
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--color-accent)' }}
              aria-hidden="true"
            />
          ) : (
            <UpdateIcon
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--color-text-muted)' }}
              aria-hidden="true"
            />
          )}
          <span className="flex-1">
            {bookmark.page != null && bookmark.total != null && bookmark.total > 0
              ? `Trang ${bookmark.page} / ${bookmark.total}`
              : isManual
                ? 'Vị trí đã lưu'
                : 'Đang đọc'}
          </span>
          <span className="shrink-0">{formatRelativeTime(bookmark.timestamp)}</span>
        </div>
      </Link>
    </div>
  )
}
