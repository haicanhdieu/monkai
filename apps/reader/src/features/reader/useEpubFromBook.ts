import { useEffect, useRef, useState } from 'react'
import { bookToEpubBuffer } from '@/shared/lib/bookToEpub'
import { epubBlobCacheKey } from '@/shared/constants/storage.keys'
import { storageService } from '@/shared/services/storage.service'
import type { Book } from '@/shared/types/global.types'

export interface UseEpubFromBookResult {
  epubUrl: string | null
  isLoading: boolean
  error: Error | null
}

/**
 * When the catalog has no epubUrl, build EPUB from the JSON book in memory,
 * cache the blob in browser storage, and expose a blob URL for the reader.
 * Pass epubUrl to ReaderEngine; revoke the blob URL on cleanup.
 */
export function useEpubFromBook(book: Book | null): UseEpubFromBookResult {
  const [epubUrl, setEpubUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!!book)
  const [error, setError] = useState<Error | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!book) {
      setEpubUrl(null)
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    const run = async () => {
      setIsLoading(true)
      setError(null)
      setEpubUrl(null)

      try {
        const cacheKey = epubBlobCacheKey(book.id)
        const cached = await storageService.getItem<Blob>(cacheKey)

        let buffer: ArrayBuffer
        if (cached instanceof Blob) {
          buffer = await cached.arrayBuffer()
        } else {
          buffer = await bookToEpubBuffer(book)
          const blob = new Blob([buffer], { type: 'application/epub+zip' })
          await storageService.setItem(cacheKey, blob)
        }

        if (cancelled) return

        const blob = new Blob([buffer], { type: 'application/epub+zip' })
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setEpubUrl(url)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [book?.id])
  const derivedLoading = isLoading || (book !== null && epubUrl === null && error === null)

  return { epubUrl, isLoading: derivedLoading, error }
}
