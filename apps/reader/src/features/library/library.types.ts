import type { CatalogBook, CatalogCategory } from '@/shared/types/global.types'

export interface LibraryCategory extends CatalogCategory {
  books: CatalogBook[]
}

export interface SearchDocument {
  id: string
  bookId: string
  title: string
  category: string
  subcategory: string
  translator: string
  coverImageUrl: string | null
}
