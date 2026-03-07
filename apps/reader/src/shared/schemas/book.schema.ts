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

function decodeHtmlEntities(input: string): string {
  if (!input.includes('&')) {
    return input
  }

  const decodeOnceWithDom = (value: string): string => {
    if (typeof document === 'undefined') {
      return value
    }

    const textarea = document.createElement('textarea')
    textarea.innerHTML = value
    return textarea.value
  }

  let decoded = input
  // Decode multiple rounds to handle double-escaped payloads (e.g. "&amp;Agrave;").
  for (let i = 0; i < 3; i++) {
    const next = decodeOnceWithDom(decoded)
    if (next === decoded) {
      break
    }
    decoded = next
  }

  return decoded
}

function normalizeParagraphs(chapters: z.infer<typeof chapterSchema>[]): BookParagraph[] {
  const paragraphs: BookParagraph[] = []

  for (const chapter of chapters) {
    const pageTexts: string[] = []

    for (const page of chapter.pages) {
      const html = page.html_content ?? page.original_html_content ?? ''
      if (!html) {
        continue
      }

      pageTexts.push(
        decodeHtmlEntities(
          html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(div|p|li)>/gi, '\n')
            .replace(/<[^>]*>/g, ' ')
        )
      )
    }

    for (const line of pageTexts.flatMap((t) => t.split('\n'))) {
      const paragraph = line.replace(/[ \t\r]+/g, ' ').trim()
      if (paragraph.length > 0) {
        paragraphs.push(paragraph)
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
