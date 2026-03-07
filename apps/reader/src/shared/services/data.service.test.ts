import { describe, expect, it, vi } from 'vitest'
import { DataError, StaticJsonDataService } from '@/shared/services/data.service'

const validCatalogPayload = {
  books: [
    {
      id: 'book-1',
      book_name: 'Kinh Bát Nhã',
      book_seo_name: 'bat-nha',
      author: 'HT. A',
      category_name: 'Kinh',
      category_seo_name: 'kinh',
      cover_image_url: null,
      artifacts: [{ format: 'json', path: 'kinh-bat-nha.json', source: 'test', built_at: '2026-01-01' }],
    },
  ],
}

const validBookPayload = {
  id: 'book-1',
  book_name: 'Kinh Bát Nhã',
  category_name: 'Kinh',
  category_seo_name: 'kinh',
  author: 'HT. A',
  chapters: [
    {
      pages: [
        { html_content: '<p>Bát Nhã tâm kinh</p>' },
        { html_content: '<p>A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39; &#x26;</p>' },
        { html_content: '<p>ĐO&Agrave;N &ldquo;TRUNG&rdquo; C&Ograve;N</p>' },
      ],
    },
  ],
}

describe('StaticJsonDataService', () => {
  it('resolves getCatalog() with typed CatalogIndex for valid payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validCatalogPayload,
    } satisfies Partial<Response>)

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001')
    const catalog = await service.getCatalog()

    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.title).toBe('Kinh Bát Nhã')
    expect(catalog.categories[0]?.slug).toBe('kinh')
  })

  it('throws DataError(parse) when catalog payload is malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ wrong: true }),
    } satisfies Partial<Response>)

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001')

    await expect(service.getCatalog()).rejects.toMatchObject({
      name: 'DataError',
      category: 'parse',
    } satisfies Partial<DataError>)
  })

  it('throws DataError(not_found) when a book file does not exist', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => validCatalogPayload,
        }
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      }
    })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001')

    await expect(service.getBook('missing')).rejects.toMatchObject({
      name: 'DataError',
      category: 'not_found',
    } satisfies Partial<DataError>)
  })

  it('parses a valid book payload into normalized content paragraphs', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => validCatalogPayload,
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => validBookPayload,
      }
    })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001')
    const book = await service.getBook('book-1')

    expect(book.id).toBe('book-1')
    expect(book.content[0]).toContain('Bát Nhã')
    expect(book.content[1]).toBe('A & B <C> "D" \'E\' &')
    expect(book.content[2]).toBe('ĐOÀN “TRUNG” CÒN')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
