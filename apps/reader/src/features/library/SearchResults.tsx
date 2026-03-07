import { Link } from 'react-router-dom'
import { toRead } from '@/shared/constants/routes'
import type { SearchDocument } from '@/features/library/library.types'
import { ChevronRightIcon } from '@radix-ui/react-icons'

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
        className="rounded px-1 py-0.5 text-[var(--color-background)]"
        style={{ backgroundColor: 'var(--color-accent)' }}
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
          className="block min-h-[44px] rounded-xl border px-4 py-4 transition-colors hover:brightness-95"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xl leading-tight" style={{ fontFamily: 'Lora, serif' }}>
                {highlightText(result.title, query)}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {result.category} • {result.subcategory}
              </p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {result.translator}
              </p>
            </div>
            <ChevronRightIcon
              className="mt-1 h-4 w-4 shrink-0 text-[var(--color-text-muted)]"
              aria-hidden="true"
            />
          </div>
        </Link>
      ))}
    </section>
  )
}
