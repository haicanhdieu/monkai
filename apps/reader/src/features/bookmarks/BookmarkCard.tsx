import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toRead } from '@/shared/constants/routes'
import { coverPlaceholderStyle } from '@/shared/constants/cover'
import { resolveCoverUrl } from '@/shared/services/data.service'
import { formatRelativeTime } from '@/shared/utils/time'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import type { Bookmark } from '@/stores/bookmarks.store'

interface BookmarkCardProps {
  bookmark: Bookmark
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  const [coverError, setCoverError] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)
  const { data: catalog } = useCatalogIndex()
  const book = catalog?.books.find((b) => b.id === bookmark.bookId)
  const coverUrl = book?.coverImageUrl ? resolveCoverUrl(book.coverImageUrl) : null

  return (
    <Link
      to={toRead(bookmark.bookId)}
      state={{ page: bookmark.page }}
      className="flex min-h-[44px] gap-4 rounded-2xl border p-4 transition-colors hover:brightness-95"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded object-cover">
        {coverUrl && !coverError && (
          <>
            {!coverLoaded && <div className="absolute inset-0" style={coverPlaceholderStyle} aria-hidden="true" />}
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
              onLoad={() => setCoverLoaded(true)}
              onError={() => setCoverError(true)}
            />
          </>
        )}
        {(!coverUrl || coverError) && <div className="h-full w-full" style={coverPlaceholderStyle} />}
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <span className="text-base font-semibold" style={{ fontFamily: 'Lora, serif' }}>
          {bookmark.bookTitle}
        </span>
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <span>Trang {bookmark.page + 1}</span>
          <span>{formatRelativeTime(bookmark.timestamp)}</span>
        </div>
      </div>
    </Link>
  )
}
