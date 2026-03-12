export type DataErrorCategory = 'network' | 'parse' | 'not_found' | 'unknown'

export type BookParagraph = string

export interface CatalogCategory {
  slug: string
  displayName: string
  count: number
}

export interface CatalogArtifact {
  format: string
  path: string
}

export interface CatalogBook {
  id: string
  title: string
  category: string
  categorySlug: string
  subcategory: string
  translator: string
  coverImageUrl: string | null
  artifacts: CatalogArtifact[]
  epubUrl?: string
}

export interface CatalogIndex {
  books: CatalogBook[]
  categories: CatalogCategory[]
}

export interface Book {
  id: string
  title: string
  category: string
  subcategory: string
  translator: string
  coverImageUrl: string | null
  content: BookParagraph[]
}
