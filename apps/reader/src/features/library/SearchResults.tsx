import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toRead } from '@/shared/constants/routes'
import { coverPlaceholderStyle } from '@/shared/constants/cover'
import { resolveCoverUrl } from '@/shared/services/data.service'
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

const getMain = () => document.querySelector('main') as HTMLElement | null

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

  return <VirtualSearchResults query={query} results={results} />
}

function VirtualSearchResults({ query, results }: SearchResultsProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: getMain,
    estimateSize: () => 116, // SearchResultCard ~108px + space-y-2 gap (8px)
    overscan: 5,
    scrollMargin,
  })

  // Reset scroll to top when query changes so results start from the beginning
  useEffect(() => {
    const main = getMain()
    if (main) main.scrollTop = 0
  }, [query])

  // Measure distance from <main> top to the list container (AppBar + search bar height)
  useLayoutEffect(() => {
    const main = getMain()
    const el = parentRef.current
    if (!main || !el) return
    setScrollMargin(el.getBoundingClientRect().top - main.getBoundingClientRect().top)
  }, [])

  return (
    <section ref={parentRef} aria-label="Kết quả tìm kiếm">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
              paddingBottom: '8px',
            }}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
          >
            <SearchResultCard result={results[virtualItem.index]} query={query} />
          </div>
        ))}
      </div>
    </section>
  )
}

function SearchResultCard({
  result,
  query,
}: {
  result: SearchDocument
  query: string
}) {
  const [coverError, setCoverError] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)
  const coverUrl = result.coverImageUrl ? resolveCoverUrl(result.coverImageUrl) : null

  return (
    <Link
      to={toRead(result.bookId)}
      aria-label={`Đọc ${result.title}`}
      className="flex min-h-[44px] gap-4 rounded-xl border px-4 py-4 transition-colors hover:brightness-95"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
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
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl leading-tight" style={{ fontFamily: 'Lora, serif' }}>
            {highlightText(result.title, query)}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {result.category}
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
  )
}
