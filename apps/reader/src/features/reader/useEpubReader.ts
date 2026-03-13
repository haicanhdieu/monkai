import { useEffect, useRef, useState } from 'react'
import ePub from 'epubjs'
import type { Book, Rendition } from 'epubjs'
import { EPUB_THEMES } from './epubThemes'

export interface UseEpubReaderResult {
  containerRef: React.RefObject<HTMLDivElement>
  rendition: Rendition | null
  book: Book | null
  isReady: boolean
  error: Error | null
}

export function useEpubReader(epubUrl: string | null): UseEpubReaderResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rendition, setRendition] = useState<Rendition | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const errorOccurredRef = useRef(false)

  useEffect(() => {
    if (!epubUrl || !containerRef.current) return

    let cancelled = false
    setIsReady(false)
    setError(null)
    errorOccurredRef.current = false

    const createBook = async () => {
      try {
        if (epubUrl.startsWith('blob:')) {
          const response = await fetch(epubUrl)
          if (!response.ok) {
            throw new Error(`Failed to fetch EPUB blob: ${response.status} ${response.statusText}`)
          }
          const buffer = await response.arrayBuffer()
          return ePub(buffer)
        }

        return ePub(epubUrl)
      } catch (err) {
        if (cancelled) return null
        const error =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Failed to load EPUB')
        // eslint-disable-next-line no-console
        console.error('[useEpubReader] createBook error:', error)
        errorOccurredRef.current = true
        setError(error)
        return null
      }
    }

    let bookInstance: Book | null = null
    let renditionInstance: Rendition | null = null

    void (async () => {
      const createdBook = await createBook()
      if (!createdBook || cancelled || !containerRef.current) return

      bookInstance = createdBook

      bookInstance.on('openFailed', (err: Error) => {
        // Helpful for diagnosing EPUB parse issues in the browser console.
        // eslint-disable-next-line no-console
        console.error('[useEpubReader] openFailed:', err)
        errorOccurredRef.current = true
        setError(err)
      })

      const localRenditionInstance = bookInstance.renderTo(containerRef.current, {
        flow: 'paginated',
        width: '100%',
        height: '100%',
      })

      renditionInstance = localRenditionInstance

      Object.entries(EPUB_THEMES).forEach(([name, styles]) => {
        localRenditionInstance.themes.register(name, styles as Record<string, Record<string, string>>)
      })

      localRenditionInstance
        .display()
        .then(() => {
          if (!errorOccurredRef.current && !cancelled) setIsReady(true)
        })
        .catch((err: Error) => {
          if (cancelled) return
          // eslint-disable-next-line no-console
          console.error('[useEpubReader] display error:', err)
          errorOccurredRef.current = true
          setError(err)
        })

      localRenditionInstance.on('loadError', (err: Error) => {
        // eslint-disable-next-line no-console
        console.error('[useEpubReader] loadError:', err)
        errorOccurredRef.current = true
        setError(err)
      })

      setBook(bookInstance)
      setRendition(localRenditionInstance)
    })()

    return () => {
      cancelled = true
      if (bookInstance) {
        bookInstance.destroy()
      }
      setBook(null)
      setRendition(null)
      setIsReady(false)
      setError(null)
    }
  }, [epubUrl])

  return { containerRef, rendition, book, isReady, error }
}
