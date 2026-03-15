import { useEffect, useRef, useState } from 'react'
import ePub from 'epubjs'
import type { Book, Rendition } from 'epubjs'
import { EPUB_THEMES } from './epubThemes'

export interface TocEntry {
  label: string
  href: string
}

export interface UseEpubReaderResult {
  containerRef: React.RefObject<HTMLDivElement>
  rendition: Rendition | null
  book: Book | null
  isReady: boolean
  error: Error | null
  getToc: () => Promise<TocEntry[]>
  navigateToTocEntry: (entry: TocEntry) => Promise<void>
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
        console.error('[useEpubReader] createBook error:', error)
        errorOccurredRef.current = true
        setError(error)
        return null
      }
    }

    let bookInstance: Book | null = null

    void (async () => {
      const createdBook = await createBook()
      if (!createdBook || cancelled || !containerRef.current) return

      bookInstance = createdBook

      bookInstance.on('openFailed', (err: Error) => {
        // Helpful for diagnosing EPUB parse issues in the browser console.
        console.error('[useEpubReader] openFailed:', err)
        errorOccurredRef.current = true
        setError(err)
      })

      const localRenditionInstance = bookInstance.renderTo(containerRef.current, {
        flow: 'paginated',
        width: '100%',
        height: '100%',
      })

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
          console.error('[useEpubReader] display error:', err)
          errorOccurredRef.current = true
          setError(err)
        })

      localRenditionInstance.on('loadError', (err: Error) => {
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

  const getToc = async (): Promise<TocEntry[]> => {
    if (!book) return []

    try {
      const anyBook = book as unknown as {
        navigation?: { toc?: Array<{ label?: string; href?: string; subitems?: unknown[] }> }
        packaging?: { navPath?: string; ncxPath?: string }
      }

      const navigationToc = anyBook.navigation?.toc ?? []
      if (!Array.isArray(navigationToc) || navigationToc.length === 0) return []

      const packaging = anyBook.packaging
      const basePath =
        typeof packaging?.navPath === 'string'
          ? packaging.navPath
          : typeof packaging?.ncxPath === 'string'
            ? packaging.ncxPath
            : ''
      const baseDir =
        basePath && basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/') + 1) : ''

      const normalizeHref = (href: string | undefined | null): string | null => {
        if (typeof href !== 'string' || !href.trim()) return null
        if (!baseDir) return href
        if (href.startsWith('/')) return href
        return `${baseDir}${href}`
      }

      const flatten = (
        items: Array<{ label?: string; href?: string; subitems?: typeof items }>,
      ): TocEntry[] => {
        const entries: TocEntry[] = []
        for (const item of items) {
          const normalizedHref = normalizeHref(item.href)
          if (typeof item.label === 'string' && item.label.trim() && normalizedHref) {
            entries.push({ label: item.label.trim(), href: normalizedHref })
          }
          if (Array.isArray(item.subitems) && item.subitems.length > 0) {
            entries.push(...flatten(item.subitems))
          }
        }
        return entries
      }

      return flatten(navigationToc as Parameters<typeof flatten>[0])
    } catch (err) {
      // Malformed nav: return empty list so UI shows "Không có mục lục" instead of error
      console.warn('[useEpubReader] getToc error (returning empty):', err)
      return []
    }
  }

  const navigateToTocEntry = async (entry: TocEntry): Promise<void> => {
    if (!rendition) return
    try {
      await rendition.display(entry.href)
    } catch (primaryErr) {
      // Fallback: resolve via spine/section and CFI when display(href) fails (e.g. nav vs OPF path)
      if (!book) {
        const err =
          primaryErr instanceof Error ? primaryErr : new Error('Failed to navigate to TOC entry')
        console.error('[useEpubReader] navigateToTocEntry error:', err)
        throw err
      }
      try {
        const [pathPart, hash] = entry.href.split('#')
        const section = book.spine.get(pathPart || entry.href)
        if (!section) throw new Error('Section not found')
        const doc = section.load(book.load.bind(book))
        if (!doc) throw new Error('Section load failed')
        const el = hash ? doc.getElementById(hash) ?? doc.body : doc.body
        if (!el) throw new Error('Target element not found')
        const cfi = section.cfiFromElement(el)
        if (!cfi) throw new Error('CFI from element failed')
        await rendition.display(cfi)
      } catch {
        const err =
          primaryErr instanceof Error ? primaryErr : new Error('Failed to navigate to TOC entry')
        console.error('[useEpubReader] navigateToTocEntry error:', err)
        throw err
      }
    }
  }

  return {
    containerRef,
    rendition,
    book,
    isReady,
    error,
    getToc,
    navigateToTocEntry,
  }
}
