import { catalogSchema } from '@/shared/schemas/catalog.schema'
import { bookSchema } from '@/shared/schemas/book.schema'
import type { Book, CatalogIndex, DataErrorCategory } from '@/shared/types/global.types'

export interface DataService {
  getCatalog(): Promise<CatalogIndex>
  getBook(id: string): Promise<Book>
}

export class DataError extends Error {
  readonly category: DataErrorCategory

  constructor(category: DataErrorCategory, message: string, public readonly details?: unknown) {
    super(message)
    this.name = 'DataError'
    this.category = category
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
  private readonly baseUrl: string
  private catalogPromise: Promise<CatalogIndex> | null = null

  constructor(private readonly fetchImpl: typeof fetch = fetch, baseUrl = resolveBookDataBaseUrl()) {
    this.baseUrl = baseUrl
  }

  async getCatalog(): Promise<CatalogIndex> {
    if (this.catalogPromise) {
      return this.catalogPromise
    }

    this.catalogPromise = (async () => {
      try {
        const response = await this.fetchJson('/book-data/index.json')
        const parsed = catalogSchema.safeParse(response)
        if (!parsed.success) {
          throw new DataError('parse', 'Catalog payload failed schema validation', parsed.error.flatten())
        }
        return parsed.data
      } catch (error) {
        this.catalogPromise = null
        throw error
      }
    })()

    return this.catalogPromise
  }

  async getBook(id: string): Promise<Book> {
    const catalog = await this.getCatalog()
    const bookEntry = catalog.books.find((b) => b.id === id)

    if (!bookEntry) {
      throw new DataError('not_found', `Book not found in catalog: ${id}`)
    }

    const jsonArtifact = bookEntry.artifacts.find((a) => a.format === 'json')
    if (!jsonArtifact) {
      throw new DataError('not_found', `JSON artifact not found for book: ${id}`)
    }

    const response = await this.fetchJson(`/book-data/${jsonArtifact.path}`)
    const parsed = bookSchema.safeParse(response)
    if (!parsed.success) {
      throw new DataError('parse', `Book payload failed schema validation for id: ${id}`, parsed.error.flatten())
    }

    return parsed.data
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

      throw new DataError('unknown', `Unexpected response status: ${response.status}`, { status: response.status })
    }

    return parseJsonResponse(response)
  }
}

export const staticJsonDataService: DataService = new StaticJsonDataService()
