import { useEffect, useMemo, useState } from 'react'
import MiniSearch from 'minisearch'
import { CategoryGrid } from '@/features/library/CategoryGrid'
import { SearchResults } from '@/features/library/SearchResults'
import type { LibraryCategory, SearchDocument } from '@/features/library/library.types'
import { toSearchDocuments } from '@/features/library/library.utils'
import type { CatalogBook } from '@/shared/types/global.types'

interface LibrarySearchHubProps {
  categories: LibraryCategory[]
  books: CatalogBook[]
}

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase('vi')
}

export function LibrarySearchHub({ categories, books }: LibrarySearchHubProps) {
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
      storeFields: ['id', 'bookId', 'title', 'category', 'subcategory', 'translator'],
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
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Tìm kiếm kinh sách</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nhập tên hoặc từ khóa..."
          className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
          aria-label="Tìm kiếm kinh sách"
        />
      </label>

      {normalizedQuery ? (
        <SearchResults query={debouncedQuery} results={results} />
      ) : (
        <CategoryGrid categories={categories} />
      )}
    </section>
  )
}
