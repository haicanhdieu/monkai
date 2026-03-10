import { Link } from 'react-router-dom'
import { BookmarkIcon, PersonIcon } from '@radix-ui/react-icons'
import { AppLogo } from '@/shared/components/AppLogo'
import { ROUTES } from '@/shared/constants/routes'
import { AppBar } from '@/shared/components/AppBar'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import { BookmarkCard } from './BookmarkCard'

export default function BookmarksPage() {
  const { bookmarks } = useBookmarksStore()
  const sorted = [...bookmarks].sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div className="pb-24">
      <AppBar
        title="Đánh Dấu"
        leftIcon={<AppLogo />}
        rightSlot={
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
          </span>
        }
      />
      <div className="px-6">
        <div className="mb-6" />

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-6 px-8 py-20 text-center">
            <BookmarkIcon className="h-12 w-12" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Chưa có đánh dấu nào. Hãy bắt đầu đọc một bản kinh!
            </p>
            <Link
              to={ROUTES.LIBRARY}
              className="rounded-full px-6 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              Khám phá Thư Viện
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {sorted.map((bookmark) => (
              <li key={bookmark.bookId}>
                <BookmarkCard bookmark={bookmark} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
