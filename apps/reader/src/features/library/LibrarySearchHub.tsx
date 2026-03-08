import { useEffect, useMemo, useState } from 'react'
import MiniSearch from 'minisearch'
import { CategoryGrid } from '@/features/library/CategoryGrid'
import { SearchResults } from '@/features/library/SearchResults'
import type { LibraryCategory, SearchDocument } from '@/features/library/library.types'
import { toSearchDocuments } from '@/features/library/library.utils'
import type { CatalogBook } from '@/shared/types/global.types'
import { Cross2Icon, MagnifyingGlassIcon } from '@radix-ui/react-icons'

interface LibrarySearchHubProps {
  categories: LibraryCategory[]
  books: CatalogBook[]
  contentClassName?: string
}

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase('vi')
}

export function LibrarySearchHub({ categories, books, contentClassName = '' }: LibrarySearchHubProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [query])

  const documents = useMemo(() => toSearchDocuments(books), [books])

  const miniSearch = useMemo(() => {
    const engine = new MiniSearch<SearchDocument>({
      fields: ['title', 'category', 'subcategory'],
      storeFields: ['id', 'bookId', 'title', 'category', 'subcategory', 'translator', 'coverImageUrl'],
      searchOptions: {
        boost: {
          title: 3,
        },
        prefix: true,
      },
    })

    engine.addAll(documents)
    return engine
  }, [documents])

  const normalizedQuery = normalizeQuery(debouncedQuery)

  const results = useMemo(() => {
    if (!normalizedQuery) {
      return []
    }

    const found = miniSearch.search(normalizedQuery)
    return found.map((item) => ({
      id: item.id as string,
      bookId: item.bookId as string,
      title: item.title as string,
      category: item.category as string,
      subcategory: item.subcategory as string,
      translator: item.translator as string,
    }))
  }, [miniSearch, normalizedQuery])

  return (
    <section className="space-y-4">
      <div
        className="flex h-12 items-center rounded-xl border px-3"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <MagnifyingGlassIcon className="mr-2 h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm kiếm kinh điển..."
          className="h-full w-full border-none bg-transparent p-0 text-sm font-medium outline-none focus:ring-0"
          aria-label="Tìm kiếm kinh sách"
        />
        {query ? (
          <button
            type="button"
            className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ color: 'var(--color-text-muted)' }}
            onClick={() => {
              setQuery('')
              setDebouncedQuery('')
            }}
            aria-label="Xóa từ khóa"
          >
            <Cross2Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {normalizedQuery ? (
        <p
          className="px-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-accent)' }}
        >
          Kết quả tìm kiếm
        </p>
      ) : null}
      <div className={contentClassName}>
        {normalizedQuery ? (
          <SearchResults query={debouncedQuery} results={results} />
        ) : (
          <CategoryGrid categories={categories} />
        )}
      </div>
    </section>
  )
}
