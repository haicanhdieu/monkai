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

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeHtmlEntities(input: string): string {
  const fromCodePointSafe = (codePoint: number, fallback: string): string => {
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      return fallback
    }
    return String.fromCodePoint(codePoint)
  }

  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = Number.parseInt(entity.slice(2), 16)
      return Number.isNaN(codePoint) ? full : fromCodePointSafe(codePoint, full)
    }

    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10)
      return Number.isNaN(codePoint) ? full : fromCodePointSafe(codePoint, full)
    }

    return NAMED_HTML_ENTITIES[entity] ?? full
  })
}

function normalizeParagraphs(chapters: z.infer<typeof chapterSchema>[]): BookParagraph[] {
  const paragraphs: BookParagraph[] = []

  for (const chapter of chapters) {
    for (const page of chapter.pages) {
      const html = page.html_content ?? page.original_html_content ?? ''
      if (!html) {
        continue
      }

      const text = decodeHtmlEntities(
        html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(div|p|li)>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
      )
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
