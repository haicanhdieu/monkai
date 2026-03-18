import { describe, expect, it, vi } from 'vitest'
import { DataError, StaticJsonDataService, resolveCoverUrl, resolveBookDataBaseUrl } from '@/shared/services/data.service'

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
    expect(book.coverImageUrl).toBeNull()
    expect(book.content[0]).toContain('Bát Nhã')
    expect(book.content[1]).toBe('A & B <C> "D" \'E\' &')
    expect(book.content[2]).toBe('ĐOÀN “TRUNG” CÒN')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns book.id as the catalog UUID, not the internal slug from book JSON', async () => {
    const catalogUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const internalSlug = 'vbeta__some-book'

    const catalogWithUuid = {
      books: [
        {
          id: catalogUuid,
          book_name: 'Test Book',
          category_name: 'Kinh',
          artifacts: [{ format: 'json', path: 'some-book.json', source: 'test', built_at: '2026-01-01' }],
        },
      ],
    }
    const bookWithSlug = {
      id: internalSlug,
      book_name: 'Test Book',
      category_name: 'Kinh',
      chapters: [],
    }

    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++
      return {
        ok: true,
        status: 200,
        json: async () => (callCount === 1 ? catalogWithUuid : bookWithSlug),
      }
    })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001')
    const book = await service.getBook(catalogUuid)

    // book.id must be the catalog UUID so bookmarks survive storage hydration
    // (hydration filter rejects slugs — only UUIDs pass isValidBookId)
    expect(book.id).toBe(catalogUuid)
    expect(book.id).not.toBe(internalSlug)
  })
})

describe('resolveCoverUrl', () => {
  it('returns null for null or empty path', () => {
    expect(resolveCoverUrl(null)).toBeNull()
    expect(resolveCoverUrl('')).toBeNull()
    expect(resolveCoverUrl('   ')).toBeNull()
  })

  it('returns absolute URL unchanged when path starts with http:// or https://', () => {
    const url = 'https://cdn.example.com/cover.jpg'
    expect(resolveCoverUrl(url)).toBe(url)
    expect(resolveCoverUrl('http://other.com/img.png')).toBe('http://other.com/img.png')
  })

  it('resolves relative path with base + /book-data/ and strips leading slash', () => {
    const base = resolveBookDataBaseUrl()
    const result1 = resolveCoverUrl('vbeta/kinh/slug/images/cover.jpg')
    expect(result1).toBe(`${base}/book-data/vbeta/kinh/slug/images/cover.jpg`)
    const result2 = resolveCoverUrl('/vbeta/kinh/cover.jpg')
    expect(result2).toBe(`${base}/book-data/vbeta/kinh/cover.jpg`)
  })

  it('strips multiple leading slashes to avoid double slash in URL', () => {
    const base = resolveBookDataBaseUrl()
    expect(resolveCoverUrl('//path/to/cover.jpg')).toBe(`${base}/book-data/path/to/cover.jpg`)
    expect(resolveCoverUrl('///a/b.jpg')).toBe(`${base}/book-data/a/b.jpg`)
  })
})
