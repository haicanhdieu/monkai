import { Link } from 'react-router-dom'
import type { CatalogBook } from '@/shared/types/global.types'
import { toRead } from '@/shared/constants/routes'
import { BookCover } from '@/shared/components/BookCover'
import { SOURCES } from '@/shared/constants/sources'
import { ChevronRightIcon } from '@radix-ui/react-icons'

interface SutraListCardProps {
  book: CatalogBook
}

export function SutraListCard({ book }: SutraListCardProps) {
  const sourceConfig = SOURCES.find((s) => s.id === book.source)
  if (import.meta.env.DEV && !sourceConfig && book.source) {
    console.warn(`[SutraListCard] Unknown source: "${book.source}" for book ${book.id}`)
  }

  return (
    <Link
      to={toRead(book.id)}
      className="flex min-h-[44px] gap-4 rounded-xl border px-4 py-4 transition-colors hover:brightness-95"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      aria-label={`Đọc ${book.title}`}
    >
      <div className="h-16 w-11 shrink-0 overflow-hidden rounded">
        <BookCover id={book.id} title={book.title} coverImageUrl={book.coverImageUrl} />
      </div>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl leading-tight" style={{ fontFamily: 'Lora, serif' }}>
            {book.title}
          </p>
          {/* book.subcategory (book_seo_name slug) is intentionally not rendered — displays a URL slug
              not meaningful to users. Field still exists in CatalogBook type for potential future use. */}
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {book.translator}
          </p>
          {sourceConfig && (
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${sourceConfig.badgeClass}`}>
              {sourceConfig.label}
            </span>
          )}
        </div>
        <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
      </div>
    </Link>
  )
}
