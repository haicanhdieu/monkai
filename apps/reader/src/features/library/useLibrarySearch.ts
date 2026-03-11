import { useEffect, useMemo, useState } from 'react'
import MiniSearch from 'minisearch'
import type { SearchDocument } from '@/features/library/library.types'
import type { CatalogBook } from '@/shared/types/global.types'
import { toSearchDocuments } from '@/features/library/library.utils'

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase('vi')
}

export interface LibrarySearchState {
  query: string
  setQuery: (q: string) => void
  clearQuery: () => void
  debouncedQuery: string
  normalizedQuery: string
  results: SearchDocument[]
}

export function useLibrarySearch(books: CatalogBook[]): LibrarySearchState {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const documents = useMemo(() => toSearchDocuments(books), [books])

  const miniSearch = useMemo(() => {
    const engine = new MiniSearch<SearchDocument>({
      fields: ['title', 'category', 'subcategory'],
      storeFields: ['id', 'bookId', 'title', 'category', 'subcategory', 'translator', 'coverImageUrl'],
      searchOptions: { boost: { title: 3 }, prefix: true },
    })
    engine.addAll(documents)
    return engine
  }, [documents])

  const normalizedQuery = normalizeQuery(debouncedQuery)

  const results = useMemo(() => {
    if (!normalizedQuery) return []
    return miniSearch.search(normalizedQuery).map((item) => ({
      id: item.id as string,
      bookId: item.bookId as string,
      title: item.title as string,
      category: item.category as string,
      subcategory: item.subcategory as string,
      translator: item.translator as string,
      coverImageUrl: item.coverImageUrl as string | null,
    }))
  }, [miniSearch, normalizedQuery])

  function clearQuery() {
    setQuery('')
    setDebouncedQuery('')
  }

  return { query, setQuery, clearQuery, debouncedQuery, normalizedQuery, results }
}
