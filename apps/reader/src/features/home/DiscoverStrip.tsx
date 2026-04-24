import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogBook } from '@/shared/types/global.types'
import { useCatalogIndex } from '@/shared/hooks/useCatalogIndex'
import { useActiveSource } from '@/shared/stores/useActiveSource'
import { resolveCoverUrl } from '@/shared/services/data.service'
import { coverPlaceholderStyle } from '@/shared/constants/cover'
import { toRead } from '@/shared/constants/routes'

const DISCOVER_COUNT = 4

function BookCoverTile({ book }: { book: CatalogBook }) {
  const [coverError, setCoverError] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)
  const coverUrl = book.coverImageUrl ? resolveCoverUrl(book.coverImageUrl) : null

  return (
    <Link
      to={toRead(book.id)}
      aria-label={`Đọc ${book.title}`}
      className="flex-none w-[88px] min-h-[44px]"
      role="listitem"
    >
      <div
        className="relative w-full overflow-hidden rounded"
        style={{ aspectRatio: '2/3' }}
      >
        {coverUrl && !coverError ? (
          <>
            {!coverLoaded && (
              <div className="absolute inset-0" style={coverPlaceholderStyle} aria-hidden="true" />
            )}
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
              onLoad={() => setCoverLoaded(true)}
              onError={() => setCoverError(true)}
            />
          </>
        ) : (
          <div className="h-full w-full" style={coverPlaceholderStyle} />
        )}
      </div>
      <p
        className="text-xs mt-1 line-clamp-2 overflow-hidden"
        style={{ fontFamily: 'Lora, serif', color: 'var(--color-text)' }}
      >
        {book.title}
      </p>
    </Link>
  )
}

function SkeletonTile() {
  return (
    <div className="flex-none w-[88px]" aria-hidden="true">
      <div
        className="w-full rounded animate-pulse"
        style={{ aspectRatio: '2/3', ...coverPlaceholderStyle }}
      />
      <div
        className="mt-1 h-3 w-3/4 rounded animate-pulse"
        style={coverPlaceholderStyle}
      />
    </div>
  )
}

function fisherYatesShuffle<T>(input: T[]): T[] {
  const arr = Array.from(input)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function DiscoverStrip() {
  const { activeSource } = useActiveSource()
  const { data, isLoading, isError } = useCatalogIndex(activeSource)

  const picks = useMemo(() => {
    const books = data?.books ?? []
    return fisherYatesShuffle(books).slice(0, DISCOVER_COUNT)
  }, [data?.books])

  if (isLoading) {
    return (
      <section className="mb-8" aria-label="Khám phá" data-testid="discover-strip">
        <h2
          className="mb-4 text-lg font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Khám Phá
        </h2>
        <div
          className="flex flex-row gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
          data-testid="discover-strip-skeleton"
        >
          {Array.from({ length: DISCOVER_COUNT }, (_, i) => (
            <SkeletonTile key={`skeleton-${i}`} />
          ))}
        </div>
      </section>
    )
  }

  if (isError || picks.length === 0) return null

  return (
    <section className="mb-8" aria-label="Khám phá" data-testid="discover-strip">
      <h2
        className="mb-4 text-lg font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Khám Phá
      </h2>
      <div
        className="flex flex-row gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden"
        role="list"
        style={{ scrollbarWidth: 'none' }}
      >
        {picks.map((book) => (
          <BookCoverTile key={book.id} book={book} />
        ))}
      </div>
    </section>
  )
}
