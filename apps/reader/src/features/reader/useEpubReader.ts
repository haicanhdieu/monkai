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

    setIsReady(false)
    setError(null)
    errorOccurredRef.current = false

    const bookInstance = ePub(epubUrl)

    bookInstance.on('openFailed', (err: Error) => {
      errorOccurredRef.current = true
      setError(err)
    })

    const renditionInstance = bookInstance.renderTo(containerRef.current, {
      flow: 'paginated',
      width: '100%',
      height: '100%',
    })

    Object.entries(EPUB_THEMES).forEach(([name, styles]) => {
      renditionInstance.themes.register(name, styles as Record<string, Record<string, string>>)
    })

    renditionInstance.display().then(() => {
      if (!errorOccurredRef.current) setIsReady(true)
    })

    renditionInstance.on('loadError', (err: Error) => {
      errorOccurredRef.current = true
      setError(err)
    })

    setBook(bookInstance)
    setRendition(renditionInstance)

    return () => {
      bookInstance.destroy()
      setBook(null)
      setRendition(null)
      setIsReady(false)
      setError(null)
    }
  }, [epubUrl])

  return { containerRef, rendition, book, isReady, error }
}
