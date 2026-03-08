import { Link } from 'react-router-dom'
import { toRead } from '@/shared/constants/routes'
import { formatRelativeTime } from '@/shared/utils/time'
import type { Bookmark } from '@/stores/bookmarks.store'

interface BookmarkCardProps {
  bookmark: Bookmark
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  return (
    <Link
      to={toRead(bookmark.bookId)}
      state={{ page: bookmark.page }}
      className="flex min-h-[44px] flex-col gap-1 rounded-2xl border p-4 transition-colors hover:brightness-95"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <span className="text-base font-semibold" style={{ fontFamily: 'Lora, serif' }}>
        {bookmark.bookTitle}
      </span>
      <div className="flex items-center justify-between text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <span>Trang {bookmark.page + 1}</span>
        <span>{formatRelativeTime(bookmark.timestamp)}</span>
      </div>
    </Link>
  )
}
