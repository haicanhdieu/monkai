import type { CatalogBook, CatalogIndex } from '@/shared/types/global.types'
import type { LibraryCategory, SearchDocument } from '@/features/library/library.types'

/**
 * Strips Vietnamese diacritical marks and tone indicators so that
 * plain-ASCII input (e.g. "dia tang") matches accented text ("Địa Tạng").
 *
 * Strategy:
 *  1. NFD decomposition – each precomposed Vietnamese character splits into
 *     a base letter + one or more combining marks (U+0300–U+036F).
 *  2. Strip all combining marks.
 *  3. Map đ/Đ → d/D explicitly (U+0111/U+0110 have no canonical decomposition).
 *
 * The resulting string has a 1-to-1 character correspondence with the original
 * NFC string, so slice indices are safe to reuse on the original text.
 */
export function stripVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
}

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
