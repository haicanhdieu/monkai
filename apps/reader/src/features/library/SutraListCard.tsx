import { Link } from 'react-router-dom'
import type { CatalogBook } from '@/shared/types/global.types'
import { toRead } from '@/shared/constants/routes'

interface SutraListCardProps {
  book: CatalogBook
}

export function SutraListCard({ book }: SutraListCardProps) {
  return (
    <Link
      to={toRead(book.id)}
      className="block rounded-xl border px-4 py-3 min-h-[44px] transition-colors hover:brightness-95"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      aria-label={`Đọc ${book.title}`}
    >
      <p className="text-lg leading-tight" style={{ fontFamily: 'Lora, serif' }}>
        {book.title}
      </p>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {book.subcategory}
      </p>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {book.translator}
      </p>
    </Link>
  )
}
