import { CategoryGrid } from '@/features/library/CategoryGrid'
import { LibrarySearchBar } from '@/features/library/LibrarySearchBar'
import { SearchResults } from '@/features/library/SearchResults'
import { useLibrarySearch } from '@/features/library/useLibrarySearch'
import type { LibraryCategory } from '@/features/library/library.types'
import type { CatalogBook } from '@/shared/types/global.types'

interface LibrarySearchHubProps {
  categories: LibraryCategory[]
  books: CatalogBook[]
  contentClassName?: string
}

export function LibrarySearchHub({ categories, books, contentClassName = '' }: LibrarySearchHubProps) {
  const { query, setQuery, clearQuery, debouncedQuery, normalizedQuery, results } = useLibrarySearch(books)

  return (
    <section className="space-y-4">
      <LibrarySearchBar query={query} onQueryChange={setQuery} onClear={clearQuery} />
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
