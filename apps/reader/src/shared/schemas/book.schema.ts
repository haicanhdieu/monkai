import { z } from 'zod'
import type { Book, BookParagraph } from '@/shared/types/global.types'

const pageSchema = z.object({
  html_content: z.string().nullable().optional(),
  original_html_content: z.string().nullable().optional(),
})

const chapterSchema = z.object({
  pages: z.array(pageSchema),
})

const rawBookSchema = z.object({
  id: z.string(),
  book_name: z.string(),
  category_name: z.string(),
  category_seo_name: z.string().optional(),
  author: z.string().nullable().optional(),
  chapters: z.array(chapterSchema).default([]),
})

function normalizeParagraphs(chapters: z.infer<typeof chapterSchema>[]): BookParagraph[] {
  const paragraphs: BookParagraph[] = []

  for (const chapter of chapters) {
    for (const page of chapter.pages) {
      const html = page.html_content ?? page.original_html_content ?? ''
      if (!html) {
        continue
      }

      const text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(div|p|li)>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (text.length > 0) {
        paragraphs.push(text)
      }
    }
  }

  return paragraphs
}

export const bookSchema: z.ZodType<Book> = rawBookSchema.transform((raw) => ({
  id: raw.id,
  title: raw.book_name,
  category: raw.category_name,
  subcategory: raw.category_seo_name ?? 'general',
  translator: raw.author ?? 'Unknown translator',
  content: normalizeParagraphs(raw.chapters),
}))
