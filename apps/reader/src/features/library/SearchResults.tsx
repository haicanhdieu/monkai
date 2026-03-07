import { Link } from 'react-router-dom'
import { toRead } from '@/shared/constants/routes'
import type { SearchDocument } from '@/features/library/library.types'

interface SearchResultsProps {
  query: string
  results: SearchDocument[]
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) {
    return text
  }

  const matcher = new RegExp(`(${escapeRegExp(query.trim())})`, 'ig')
  const parts = text.split(matcher)

  return parts.map((part, index) =>
    matcher.test(part) ? (
      <mark
        key={`${part}-${index}`}
        className="rounded px-0.5"
        style={{ backgroundColor: 'rgba(200, 136, 58, 0.25)' }}
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  )
}

export function SearchResults({ query, results }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <section
        className="rounded-xl border p-4"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <p className="font-medium">Không tìm thấy kết quả</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Thử một từ khóa ngắn hơn hoặc bỏ dấu.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-2" aria-label="Kết quả tìm kiếm">
      {results.map((result) => (
        <Link
          key={result.id}
          to={toRead(result.bookId)}
          aria-label={`Đọc ${result.title}`}
          className="block rounded-xl border px-4 py-3 min-h-[44px] transition-colors hover:brightness-95"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <p className="text-lg leading-tight" style={{ fontFamily: 'Lora, serif' }}>
            {highlightText(result.title, query)}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {result.category} • {result.subcategory}
          </p>
        </Link>
      ))}
    </section>
  )
}
