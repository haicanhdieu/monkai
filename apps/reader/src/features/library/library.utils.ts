import type { CatalogBook, CatalogCategory, CatalogIndex } from '@/shared/types/global.types'
import type { LibraryCategory, SearchDocument } from '@/features/library/library.types'

const bookCollator = new Intl.Collator('vi')

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
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
}

export function normalizeCategorySlug(input: string): string {
  return input.trim().toLowerCase()
}

// Returns sorted category headers only — no book processing.
// Use in LibraryPage where CategoryGrid only needs slug/displayName/count.
export function buildLibraryCategoryHeaders(catalog: CatalogIndex): CatalogCategory[] {
  return [...catalog.categories].sort((a, b) => bookCollator.compare(a.displayName, b.displayName))
}

export function getCategoryBySlug(catalog: CatalogIndex, slug: string): LibraryCategory | undefined {
  const normalizedSlug = normalizeCategorySlug(slug)
  const category = catalog.categories.find(
    (c) => normalizeCategorySlug(c.slug) === normalizedSlug,
  )
  if (!category) return undefined
  const books = catalog.books
    .filter((b) => b.categorySlug === category.slug)
    .sort((a, b) => bookCollator.compare(a.title, b.title))
  return { ...category, books }
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
