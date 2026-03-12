import { z } from 'zod'
import type { CatalogBook, CatalogCategory, CatalogIndex } from '@/shared/types/global.types'

const catalogArtifactSchema = z.object({
  source: z.string(),
  format: z.string(),
  path: z.string(),
  built_at: z.string(),
})

const rawCatalogBookSchema = z.object({
  id: z.string(),
  book_name: z.string(),
  book_seo_name: z.string().optional(),
  author: z.string().nullable().optional(),
  category_name: z.string(),
  category_seo_name: z.string().optional(),
  cover_image_url: z.string().nullable().optional(),
  artifacts: z.array(catalogArtifactSchema).optional(),
  epubUrl: z.string().optional(),
})

const rawCatalogSchema = z.object({
  books: z.array(rawCatalogBookSchema),
})

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toCatalogBook(raw: z.infer<typeof rawCatalogBookSchema>): CatalogBook {
  return {
    id: raw.id,
    title: raw.book_name,
    category: raw.category_name,
    categorySlug: raw.category_seo_name ?? slugify(raw.category_name),
    subcategory: raw.book_seo_name ?? 'General',
    translator: raw.author ?? 'Unknown translator',
    coverImageUrl: raw.cover_image_url ?? null,
    artifacts: (raw.artifacts ?? []).map((a) => ({
      format: a.format,
      path: a.path,
    })),
    epubUrl: raw.epubUrl,
  }
}

function buildCategories(books: CatalogBook[]): CatalogCategory[] {
  const categoryMap = new Map<string, CatalogCategory>()

  for (const book of books) {
    const existing = categoryMap.get(book.categorySlug)
    if (existing) {
      existing.count += 1
      continue
    }

    categoryMap.set(book.categorySlug, {
      slug: book.categorySlug,
      displayName: book.category,
      count: 1,
    })
  }

  return [...categoryMap.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'))
}

export const catalogSchema: z.ZodType<CatalogIndex> = rawCatalogSchema.transform((raw) => {
  const books = raw.books.map(toCatalogBook)
  return {
    books,
    categories: buildCategories(books),
  }
})
