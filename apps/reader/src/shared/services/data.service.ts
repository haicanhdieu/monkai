import { catalogSchema } from '@/shared/schemas/catalog.schema'
import { bookSchema } from '@/shared/schemas/book.schema'
import type { Book, CatalogIndex, DataErrorCategory } from '@/shared/types/global.types'
import type { SourceId } from '@/shared/constants/sources'
import { storageService as defaultStorageService, type StorageService } from '@/shared/services/storage.service'
import { catalogCacheKey, bookCacheKey } from '@/shared/constants/storage.keys'

export interface DataService {
  getCatalog(source: SourceId): Promise<CatalogIndex>
  getBook(id: string, source: SourceId): Promise<Book>
}

export class DataError extends Error {
  readonly category: DataErrorCategory
  readonly details?: unknown

  constructor(category: DataErrorCategory, message: string, details?: unknown) {
    super(message)
    this.name = 'DataError'
    this.category = category
    this.details = details
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function toAbsolutePath(base: string, path: string): string {
  if (!base) {
    return path
  }
  return `${trimTrailingSlash(base)}${path}`
}

export function resolveBookDataBaseUrl(): string {
  const explicitBaseUrl = import.meta.env.VITE_BOOK_DATA_URL as string | undefined
  if (explicitBaseUrl && explicitBaseUrl.trim().length > 0) {
    return trimTrailingSlash(explicitBaseUrl.trim())
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:3001'
  }

  const basePath = (import.meta.env.BASE_URL as string | undefined) ?? '/'
  return basePath === '/' ? '' : trimTrailingSlash(basePath)
}

/**
 * Resolves a cover image path to a full URL.
 * - null/empty → null
 * - Absolute URL (http/https) → return as-is
 * - Relative path → base + /book-data/ + path (leading slash stripped)
 */
export function resolveCoverUrl(relativePath: string | null): string | null {
  const trimmed = relativePath?.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  const path = trimmed.replace(/^\/+/, '')
  return toAbsolutePath(resolveBookDataBaseUrl(), `/book-data/${path}`)
}

function parseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown data parsing failure'
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch (error) {
    throw new DataError('parse', 'Invalid JSON payload', parseErrorMessage(error))
  }
}

export class StaticJsonDataService implements DataService {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly storage: StorageService
  private catalogPromises: Map<SourceId, Promise<CatalogIndex>> = new Map()

  constructor(
    fetchImpl: typeof fetch = fetch.bind(globalThis),
    baseUrl = resolveBookDataBaseUrl(),
    storage: StorageService = defaultStorageService,
  ) {
    this.fetchImpl = fetchImpl
    this.baseUrl = baseUrl
    this.storage = storage
  }

  async getCatalog(source: SourceId): Promise<CatalogIndex> {
    const existing = this.catalogPromises.get(source)
    if (existing) return existing

    const path = `/book-data/${source}/index.json`

    const promise = (async () => {
      try {
        const response = await this.fetchJson(path)
        const parsed = catalogSchema.safeParse(response)
        if (!parsed.success) {
          throw new DataError('parse', 'Catalog payload failed schema validation', parsed.error.flatten())
        }
        void this.storage.setItem(catalogCacheKey(source), parsed.data)
        return parsed.data
      } catch (error) {
        this.catalogPromises.delete(source)
        if (error instanceof DataError && error.category === 'network') {
          try {
            const cached = await this.storage.getItem<CatalogIndex>(catalogCacheKey(source))
            // Validate minimum shape: stored data is already-transformed CatalogIndex, not raw JSON
            if (cached && Array.isArray(cached.books)) return cached
          } catch {
            // storage read failed — treat as cache miss
          }
        }
        throw error
      }
    })()

    this.catalogPromises.set(source, promise)
    return promise
  }

  async getBook(id: string, source: SourceId): Promise<Book> {
    try {
      const catalog = await this.getCatalog(source)
      const bookEntry = catalog.books.find((b) => b.id === id)

      if (!bookEntry) {
        throw new DataError('not_found', `Book not found in catalog: ${id}`)
      }

      const jsonArtifact = bookEntry.artifacts.find((a) => a.format === 'json')
      if (!jsonArtifact) {
        throw new DataError('not_found', `JSON artifact not found for book: ${id}`)
      }

      const artifactPath = jsonArtifact.path
      if (artifactPath.startsWith('/') || artifactPath.includes('..')) {
        throw new DataError('parse', `Invalid artifact path for book: ${id}`)
      }

      const response = await this.fetchJson(`/book-data/${artifactPath}`)
      const parsed = bookSchema.safeParse(response)
      if (!parsed.success) {
        throw new DataError('parse', `Book payload failed schema validation for id: ${id}`, parsed.error.flatten())
      }

      // Override the internal slug id and inject source from the caller.
      // book.json files have no source field — it is always injected here.
      const book: Book = { ...parsed.data, id, source }
      void this.storage.setItem(bookCacheKey(id, source), book)
      return book
    } catch (error) {
      if (error instanceof DataError && error.category === 'network') {
        try {
          const cached = await this.storage.getItem<Book>(bookCacheKey(id, source))
          if (cached && Array.isArray(cached.content)) return cached
        } catch {
          // storage read failed — treat as cache miss
        }
      }
      throw error
    }
  }

  private async fetchJson(path: string): Promise<unknown> {
    const url = toAbsolutePath(this.baseUrl, path)

    let response: Response
    try {
      response = await this.fetchImpl(url)
    } catch (error) {
      throw new DataError('network', `Network request failed for ${url}`, parseErrorMessage(error))
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new DataError('not_found', `Resource not found: ${url}`, { status: response.status })
      }

      // 5xx: server/proxy temporarily unavailable — treat as network failure so
      // localforage fallback in getCatalog/getBook is reachable.
      if (response.status >= 500) {
        throw new DataError('network', `Server temporarily unavailable: ${response.status}`, { status: response.status })
      }

      throw new DataError('unknown', `Unexpected response status: ${response.status}`, { status: response.status })
    }

    return parseJsonResponse(response)
  }
}

export const staticJsonDataService: DataService = new StaticJsonDataService()
