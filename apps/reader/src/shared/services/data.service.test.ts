import { describe, expect, it, vi } from 'vitest'
import { DataError, StaticJsonDataService, resolveCoverUrl, resolveBookDataBaseUrl, resolveEpubUrl } from '@/shared/services/data.service'
import type { StorageService } from '@/shared/services/storage.service'

function makeNoopStorage(overrides?: Partial<StorageService>): StorageService {
  return {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

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

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())
    const catalog = await service.getCatalog('vbeta')

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

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())

    await expect(service.getCatalog('vbeta')).rejects.toMatchObject({
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

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())

    await expect(service.getBook('missing', 'vbeta')).rejects.toMatchObject({
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

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())
    const book = await service.getBook('book-1', 'vbeta')

    expect(book.id).toBe('book-1')
    expect(book.source).toBe('vbeta')
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
      chapters: [{ pages: [{ html_content: '<p>Content</p>' }] }],
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

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())
    const book = await service.getBook(catalogUuid, 'vbeta')

    // book.id must be the catalog UUID so bookmarks survive storage hydration
    // (hydration filter rejects slugs — only UUIDs pass isValidBookId)
    expect(book.id).toBe(catalogUuid)
    expect(book.id).not.toBe(internalSlug)
  })
})

describe('offline fallback', () => {
  const networkError = new TypeError('Failed to fetch')

  it('getCatalog returns cached catalog from storage when network fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(networkError)
    const cachedCatalog = { books: [], categories: [] }
    const storage = makeNoopStorage({ getItem: vi.fn().mockResolvedValue(cachedCatalog) })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', storage)
    const result = await service.getCatalog('vbeta')

    expect(result).toBe(cachedCatalog)
    expect(storage.getItem).toHaveBeenCalledWith('catalog_cache_v1_vbeta')
  })

  it('getCatalog throws DataError(network) when network fails and no cache', async () => {
    const fetchMock = vi.fn().mockRejectedValue(networkError)
    const storage = makeNoopStorage()

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', storage)

    await expect(service.getCatalog('vbeta')).rejects.toMatchObject({
      name: 'DataError',
      category: 'network',
    } satisfies Partial<DataError>)
  })

  it('getCatalog writes to storage on successful fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validCatalogPayload,
    } satisfies Partial<Response>)
    const storage = makeNoopStorage()

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', storage)
    await service.getCatalog('vbeta')

    expect(storage.setItem).toHaveBeenCalledWith('catalog_cache_v1_vbeta', expect.objectContaining({ books: expect.any(Array) }))
  })

  it('getBook returns cached book from storage when network fails after catalog loads from cache', async () => {
    const fetchMock = vi.fn().mockRejectedValue(networkError)
    const cachedCatalog = {
      books: [{ id: 'book-1', title: 'Kinh A', artifacts: [{ format: 'json', path: 'a.json' }] }],
      categories: [],
    }
    const cachedBook = { id: 'book-1', source: 'vbeta', title: 'Kinh A', content: [], coverImageUrl: null }
    const storage = makeNoopStorage({
      getItem: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'catalog_cache_v1_vbeta') return cachedCatalog
        if (key === 'book_cache_v1_vbeta_book-1') return cachedBook
        return null
      }),
    })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', storage)
    const result = await service.getBook('book-1', 'vbeta')

    expect(result).toBe(cachedBook)
    expect(storage.getItem).toHaveBeenCalledWith('book_cache_v1_vbeta_book-1')
  })

  it('getBook throws DataError(network) when network fails and book not in cache', async () => {
    const fetchMock = vi.fn().mockRejectedValue(networkError)
    const cachedCatalog = {
      books: [{ id: 'book-1', title: 'Kinh A', artifacts: [{ format: 'json', path: 'a.json' }] }],
      categories: [],
    }
    const storage = makeNoopStorage({
      getItem: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'catalog_cache_v1_vbeta') return cachedCatalog
        return null
      }),
    })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', storage)

    await expect(service.getBook('book-1', 'vbeta')).rejects.toMatchObject({
      name: 'DataError',
      category: 'network',
    } satisfies Partial<DataError>)
  })

  it('getCatalog returns cached catalog when server returns 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } satisfies Partial<Response>)
    const cachedCatalog = { books: [], categories: [] }
    const storage = makeNoopStorage({ getItem: vi.fn().mockResolvedValue(cachedCatalog) })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', storage)
    const result = await service.getCatalog('vbeta')

    expect(result).toBe(cachedCatalog)
    expect(storage.getItem).toHaveBeenCalledWith('catalog_cache_v1_vbeta')
  })

  it('getCatalog throws DataError(network) when server returns 5xx and no cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } satisfies Partial<Response>)
    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())

    await expect(service.getCatalog('vbeta')).rejects.toMatchObject({
      name: 'DataError',
      category: 'network',
    } satisfies Partial<DataError>)
  })

  it('getBook returns cached book when server returns 5xx after catalog loads from cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } satisfies Partial<Response>)
    const cachedCatalog = {
      books: [{ id: 'book-1', title: 'Kinh A', artifacts: [{ format: 'json', path: 'a.json' }] }],
      categories: [],
    }
    const cachedBook = { id: 'book-1', source: 'vbeta', title: 'Kinh A', content: [], coverImageUrl: null }
    const storage = makeNoopStorage({
      getItem: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'catalog_cache_v1_vbeta') return cachedCatalog
        if (key === 'book_cache_v1_vbeta_book-1') return cachedBook
        return null
      }),
    })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', storage)
    const result = await service.getBook('book-1', 'vbeta')

    expect(result).toBe(cachedBook)
    expect(storage.getItem).toHaveBeenCalledWith('book_cache_v1_vbeta_book-1')
  })

  it('getBook writes to storage on successful fetch', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) return { ok: true, status: 200, json: async () => validCatalogPayload }
      return { ok: true, status: 200, json: async () => validBookPayload }
    })
    const storage = makeNoopStorage()

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', storage)
    await service.getBook('book-1', 'vbeta')

    expect(storage.setItem).toHaveBeenCalledWith(
      'book_cache_v1_vbeta_book-1',
      expect.objectContaining({ id: 'book-1', source: 'vbeta' }),
    )
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

describe('resolveEpubUrl (Story 2.3)', () => {
  it('returns null for null, undefined, or empty', () => {
    expect(resolveEpubUrl(null)).toBeNull()
    expect(resolveEpubUrl(undefined)).toBeNull()
    expect(resolveEpubUrl('')).toBeNull()
    expect(resolveEpubUrl('   ')).toBeNull()
  })

  it('returns absolute http/https URL unchanged', () => {
    expect(resolveEpubUrl('https://tunnel.example.com/book-data/onedrive/sach/sach.epub')).toBe(
      'https://tunnel.example.com/book-data/onedrive/sach/sach.epub',
    )
    expect(resolveEpubUrl('http://localhost:3001/book-data/sach.epub')).toBe(
      'http://localhost:3001/book-data/sach.epub',
    )
  })

  it('resolves relative path to base + /book-data/ + path', () => {
    const base = resolveBookDataBaseUrl()
    expect(resolveEpubUrl('onedrive/sach-nhat-tung/sach-nhat-tung.epub')).toBe(
      `${base}/book-data/onedrive/sach-nhat-tung/sach-nhat-tung.epub`,
    )
  })

  it('strips leading slash from relative path', () => {
    const base = resolveBookDataBaseUrl()
    expect(resolveEpubUrl('/onedrive/sach/sach.epub')).toBe(
      `${base}/book-data/onedrive/sach/sach.epub`,
    )
  })
})

const onedriveIndexPayload = {
  books: [
    {
      id: 'onedrive-book-1',
      book_name: 'Sách Nhật Tụng',
      author: 'Thích Nhất Hạnh',
      category_name: 'Văn Học',
      category_seo_name: 'van-hoc',
      epubUrl: 'onedrive/sach-nhat-tung/sach-nhat-tung.epub',
      source: 'onedrive',
    },
  ],
}

const vnthuquanIndexPayload = {
  books: [
    {
      id: 'vnthuquan-book-1',
      book_name: 'Truyện Kiều',
      author: 'Nguyễn Du',
      category_name: 'Thơ',
      category_seo_name: 'tho',
      artifacts: [{ format: 'json', path: 'truyen-kieu.json', source: 'vnthuquan', built_at: '2026-01-01' }],
      source: 'vnthuquan',
    },
  ],
}

describe('getCatalog – onedrive merge (Story 2.2)', () => {
  it('merges vnthuquan and onedrive books into a single CatalogIndex', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('/onedrive/') ? onedriveIndexPayload : vnthuquanIndexPayload),
    }))

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())
    const catalog = await service.getCatalog('vnthuquan')

    expect(catalog.books).toHaveLength(2)
    const ids = catalog.books.map((b) => b.id)
    expect(ids).toContain('vnthuquan-book-1')
    expect(ids).toContain('onedrive-book-1')
  })

  it('rebuilds categories from merged books', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('/onedrive/') ? onedriveIndexPayload : vnthuquanIndexPayload),
    }))

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())
    const catalog = await service.getCatalog('vnthuquan')

    const categorySlugs = catalog.categories.map((c) => c.slug)
    expect(categorySlugs).toContain('tho')
    expect(categorySlugs).toContain('van-hoc')
  })

  it('still returns vnthuquan books when onedrive fetch fails (404)', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/onedrive/')) {
        return { ok: false, status: 404, json: async () => ({}) }
      }
      return { ok: true, status: 200, json: async () => vnthuquanIndexPayload }
    })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())
    const catalog = await service.getCatalog('vnthuquan')

    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.id).toBe('vnthuquan-book-1')
  })

  it('still returns vnthuquan books when onedrive fetch throws network error', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/onedrive/')) throw new TypeError('Failed to fetch')
      return { ok: true, status: 200, json: async () => vnthuquanIndexPayload }
    })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())
    const catalog = await service.getCatalog('vnthuquan')

    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.id).toBe('vnthuquan-book-1')
  })

  it('resolves epubUrl for onedrive books to absolute URL', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('/onedrive/') ? onedriveIndexPayload : vnthuquanIndexPayload),
    }))

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())
    const catalog = await service.getCatalog('vnthuquan')

    const onedriveBook = catalog.books.find((b) => b.id === 'onedrive-book-1')
    expect(onedriveBook?.epubUrl).toBe(
      'http://localhost:3001/book-data/onedrive/sach-nhat-tung/sach-nhat-tung.epub',
    )
    // epubUrl must be absolute (not the raw relative path from the index)
    expect(onedriveBook?.epubUrl).toMatch(/^https?:\/\//)
  })

  it('vbeta catalog fetches only vbeta source (no merge)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validCatalogPayload,
    } satisfies Partial<Response>)

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())
    await service.getCatalog('vbeta')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/book-data/vbeta/index.json'))
  })
})

describe('getBook – onedrive books (Story 2.2)', () => {
  const mergedCatalogPayload = {
    books: [
      {
        id: 'onedrive-book-1',
        book_name: 'Sách Nhật Tụng',
        author: 'Thích Nhất Hạnh',
        category_name: 'Văn Học',
        category_seo_name: 'van-hoc',
        epubUrl: 'onedrive/sach-nhat-tung/sach-nhat-tung.epub',
        source: 'onedrive',
      },
    ],
  }

  it('returns minimal Book for onedrive book (no JSON artifact, has epubUrl)', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++
      return { ok: true, status: 200, json: async () => (callCount <= 2 ? mergedCatalogPayload : {}) }
    })

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', makeNoopStorage())
    const book = await service.getBook('onedrive-book-1', 'vnthuquan')

    expect(book.id).toBe('onedrive-book-1')
    expect(book.title).toBe('Sách Nhật Tụng')
    expect(book.source).toBe('vnthuquan')
    expect(book.content).toEqual([])
  })

  it('caches minimal onedrive Book to storage', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++
      return { ok: true, status: 200, json: async () => (callCount <= 2 ? mergedCatalogPayload : {}) }
    })
    const storage = makeNoopStorage()

    const service = new StaticJsonDataService(fetchMock as typeof fetch, 'http://localhost:3001', storage)
    await service.getBook('onedrive-book-1', 'vnthuquan')

    expect(storage.setItem).toHaveBeenCalledWith(
      'book_cache_v1_vnthuquan_onedrive-book-1',
      expect.objectContaining({ id: 'onedrive-book-1', source: 'vnthuquan' }),
    )
  })
})
