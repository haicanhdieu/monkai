import type { CatalogBook, CatalogIndex } from '@/shared/types/global.types'
import type { LibraryCategory, SearchDocument } from '@/features/library/library.types'

export function normalizeCategorySlug(input: string): string {
  return input.trim().toLowerCase()
}

export function sortBooksByTitle(books: CatalogBook[]): CatalogBook[] {
  return [...books].sort((a, b) => a.title.localeCompare(b.title, 'vi'))
}

export function buildLibraryCategories(catalog: CatalogIndex): LibraryCategory[] {
  return catalog.categories
    .map((category) => ({
      ...category,
      books: sortBooksByTitle(catalog.books.filter((book) => book.categorySlug === category.slug)),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'))
}

export function getCategoryBySlug(catalog: CatalogIndex, slug: string): LibraryCategory | undefined {
  const normalizedSlug = normalizeCategorySlug(slug)
  return buildLibraryCategories(catalog).find(
    (category) => normalizeCategorySlug(category.slug) === normalizedSlug,
  )
}

export function toSearchDocuments(books: CatalogBook[]): SearchDocument[] {
  return books.map((book) => ({
    id: book.id,
    bookId: book.id,
    title: book.title,
    category: book.category,
    subcategory: book.subcategory,
    translator: book.translator,
    coverImageUrl: book.coverImageUrl,
  }))
}
