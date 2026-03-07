import { Link } from 'react-router-dom'
import type { CatalogBook } from '@/shared/types/global.types'
import { toRead } from '@/shared/constants/routes'
import { ChevronRightIcon } from '@radix-ui/react-icons'

interface SutraListCardProps {
  book: CatalogBook
}

export function SutraListCard({ book }: SutraListCardProps) {
  return (
    <Link
      to={toRead(book.id)}
      className="block min-h-[44px] rounded-xl border px-4 py-4 transition-colors hover:brightness-95"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      aria-label={`Đọc ${book.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl leading-tight" style={{ fontFamily: 'Lora, serif' }}>
            {book.title}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {book.subcategory}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {book.translator}
          </p>
        </div>
        <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
      </div>
    </Link>
  )
}
