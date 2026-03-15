import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, ArrowRightIcon, HamburgerMenuIcon, ListBulletIcon } from '@radix-ui/react-icons'
import { ROUTES } from '@/shared/constants/routes'
import { useReaderStore } from '@/stores/reader.store'
import type { Book } from '@/shared/types/global.types'
import type { TocEntry } from './useEpubReader'
import { TocDrawer } from './TocDrawer'
import { ReaderSettingsDrawer } from './ReaderSettingsDrawer'

// TODO: epub.js rewrite in Story 2.2
// ChromelessLayout previously read currentPage, pages, hasSeenHint, and dismissHint
// from reader.store. After the CFI migration (Story 3.1), these fields are removed.
// - hasSeenHint/dismissHint are now local state (chromeless-layout only concern)
// - currentPage and pages are stubbed; page progress will use CFI in Story 2.2
// - isChromeVisible and toggleChrome remain in reader.store

export const CHROME_AUTOHIDE_MS = 3000
const HINT_LABELS = {
  left: 'Trang trước',
  center: 'Menu',
  right: 'Trang tiếp',
} as const

interface ChromelessLayoutProps {
  book: Book
  /** When true, page 0 is the cover/placeholder and totalPages = 1 + content pages. Must be set explicitly by the caller (e.g. reader route passes true). */
  hasCoverPage: boolean
  children: ReactNode
  getToc?: () => Promise<TocEntry[]>
  navigateToTocEntry?: (entry: TocEntry) => Promise<void>
  /** When false, hint auto-hide timer is deferred until the reader is ready. Defaults to true (tests and non-epub callers). */
  isReady?: boolean
}

export function ChromelessLayout({
  book,
  hasCoverPage,
  children,
  getToc,
  navigateToTocEntry,
  isReady = true,
}: ChromelessLayoutProps) {
  const navigate = useNavigate()
  const { isChromeVisible, toggleChrome, currentPage, totalPages } = useReaderStore()

  // Hint state: resets on every book open (local state, not persisted)
  const [hasSeenHint, setHasSeenHint] = useState(false)
  const dismissHint = () => setHasSeenHint(true)

  // history.length can be unreliable in iframes or some browser contexts; fallback to Library when uncertain.
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate(ROUTES.LIBRARY)
    }
  }
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const totalPagesDisplay = hasCoverPage ? Math.max(1, totalPages + 1) : totalPages
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tocTriggerRef = useRef<HTMLButtonElement>(null)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const settingsTriggerRef = useRef<HTMLButtonElement>(null)
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([])
  const [tocLoading, setTocLoading] = useState(false)
  const [tocError, setTocError] = useState<Error | null>(null)
  const [tocNavigateError, setTocNavigateError] = useState<string | null>(null)

  // Auto-hide chrome after 3 seconds on first mount (AC 3)
  useEffect(() => {
    autoHideTimerRef.current = setTimeout(() => {
      if (useReaderStore.getState().isChromeVisible) {
        toggleChrome()
      }
    }, CHROME_AUTOHIDE_MS)

    return () => {
      if (autoHideTimerRef.current !== null) {
        clearTimeout(autoHideTimerRef.current)
      }
    }
  }, [toggleChrome])

  // Auto-hide hint after CHROME_AUTOHIDE_MS once the reader is ready.
  // Deferred until isReady=true so the timer doesn't fire during epub loading (skeleton phase),
  // which would dismiss hints before the user ever sees the actual reader content.
  // Guard: skip if hint already seen (avoids gratuitous localStorage write for returning users).
  useEffect(() => {
    if (!isReady || hasSeenHint) return
    const t = setTimeout(() => dismissHint(), CHROME_AUTOHIDE_MS)
    return () => clearTimeout(t)
    // safe: closure captures stable setHasSeenHint setter; isReady only transitions false→true once
  }, [isReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle center-tap: cancel auto-hide timer first so a user reveal isn't overridden 3s later.
  // Clears the timer on first interaction so chrome state stays fully user-controlled after that.
  const handleCenterTap = () => {
    if (autoHideTimerRef.current !== null) {
      clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = null
    }
    toggleChrome()
    if (!hasSeenHint) {
      dismissHint()
    }
  }

  // Keep a stable ref so the keyboard effect never goes stale (same pattern as ReaderEngine)
  const handleCenterTapRef = useRef(handleCenterTap)
  handleCenterTapRef.current = handleCenterTap

  // Keyboard shortcut: Escape toggles chrome for keyboard-only users (MED-4 from code review)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleCenterTapRef.current()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, []) // stable via ref

  const chromeHidden = !isChromeVisible
  const prevChromeVisibleRef = useRef(isChromeVisible)

  // When chrome becomes visible (e.g. via Escape), move focus to back button for keyboard users (F8).
  useEffect(() => {
    if (isChromeVisible && !prevChromeVisibleRef.current) {
      backButtonRef.current?.focus()
    }
    prevChromeVisibleRef.current = isChromeVisible
  }, [isChromeVisible])

  const handleOpenToc = () => {
    if (!getToc || !navigateToTocEntry) return
    setIsTocOpen(true)
    setTocLoading(true)
    setTocError(null)
    setTocNavigateError(null)
    void getToc()
      .then((entries) => {
        setTocEntries(entries)
      })
      .catch((err) => {
        setTocError(err instanceof Error ? err : new Error('Không tải được mục lục'))
      })
      .finally(() => {
        setTocLoading(false)
      })
  }

  const handleCloseToc = () => {
    setIsTocOpen(false)
    tocTriggerRef.current?.focus()
  }

  const handleCloseSettings = () => {
    setIsSettingsOpen(false)
    settingsTriggerRef.current?.focus()
  }

  // Clear navigation error after a short delay so user can read it
  useEffect(() => {
    if (!tocNavigateError) return
    const t = setTimeout(() => setTocNavigateError(null), 4000)
    return () => clearTimeout(t)
  }, [tocNavigateError])

  const handleSelectTocEntry = (entry: TocEntry) => {
    if (!navigateToTocEntry) return
    setTocNavigateError(null)
    void navigateToTocEntry(entry)
      .then(() => {
        handleCloseToc()
      })
      .catch(() => {
        setTocNavigateError('Không chuyển được đến mục đã chọn.')
        handleCloseToc()
      })
  }

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--color-background)' }}
      data-testid="chromeless-layout"
    >
      {/* Top bar overlay — position:fixed so it doesn't reflow text (AC 4) */}
      <div
        className="fixed top-0 left-0 right-0 z-20 flex items-center px-4 py-3 transition-opacity duration-300"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          opacity: chromeHidden ? 0 : 1,
          pointerEvents: chromeHidden ? 'none' : 'auto',
        }}
        role="navigation"
        aria-label="Điều hướng đầu trang"
        data-testid="chrome-top-bar"
      >
        <button
          ref={backButtonRef}
          type="button"
          onClick={handleBack}
          className="text-sm bg-transparent border-none cursor-pointer p-2 font-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
          style={{ color: 'var(--color-text-muted)' }}
          tabIndex={chromeHidden ? -1 : 0}
          aria-label="Về Thư viện"
          data-testid="chrome-back"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        </button>
        <h1
          className="flex-1 text-center text-sm font-medium truncate px-4"
          style={{ color: 'var(--color-text)', fontFamily: 'Inter, sans-serif' }}
        >
          {book.title}
        </h1>
        {getToc && navigateToTocEntry && (
          <button
            ref={tocTriggerRef}
            type="button"
            onClick={handleOpenToc}
            className="text-sm bg-transparent border-none cursor-pointer p-2 font-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            style={{ color: 'var(--color-text-muted)' }}
            tabIndex={chromeHidden ? -1 : 0}
            aria-label="Mở mục lục"
            data-testid="toc-trigger"
          >
            <ListBulletIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Brief message when TOC navigation failed (drawer already closed) */}
      {tocNavigateError && (
        <div
          className="fixed left-0 right-0 z-25 px-4 py-2 text-center text-xs"
          style={{
            top: '52px',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-muted)',
            borderBottom: '1px solid var(--color-border)',
          }}
          role="alert"
          data-testid="toc-navigate-error"
        >
          {tocNavigateError}
        </div>
      )}

      {/* Main reading area */}
      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>

      {/* Bottom bar overlay — position:fixed so it doesn't reflow text (AC 4) */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 transition-opacity duration-300"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          opacity: chromeHidden ? 0 : 1,
          pointerEvents: chromeHidden ? 'none' : 'auto',
        }}
        data-testid="chrome-bottom-bar"
      >
        <span
          className="text-xs"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
        >
          {totalPagesDisplay > 0 ? `${currentPage} / ${totalPagesDisplay}` : ''}
        </span>
        <button
          ref={settingsTriggerRef}
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="text-sm font-medium bg-transparent border-none cursor-pointer px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
          tabIndex={chromeHidden ? -1 : 0}
          aria-label="Mở cài đặt hiển thị"
          data-testid="settings-trigger"
        >
          Aa
        </button>
      </div>

      {/* Center-tap zone — covers middle 60%, z-index below chrome bars but above content (AC 2)
          Left/right 20% are intentionally exposed so ReaderEngine tap zones work through. */}
      <div
        className="fixed top-0 bottom-0 z-10"
        style={{ left: '20%', right: '20%' }}
        onClick={handleCenterTap}
        aria-hidden="true"
        data-testid="center-tap-zone"
      />

      {/* First-open hint — left/right pills at screen edges, center pill in the middle */}
      {!hasSeenHint && (
        <div
          className="pointer-events-none fixed inset-0 z-[11] flex items-center justify-between"
          data-testid="chrome-hint"
          aria-hidden="true"
        >
          {/* Left: previous page — no left margin so pill sits at screen edge */}
          <span
            className="flex flex-col items-center gap-1 text-xs px-3 py-3 rounded-r-2xl text-center w-20"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              borderLeftWidth: 0,
            }}
          >
            <ArrowLeftIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{HINT_LABELS.left}</span>
          </span>
          {/* Center: toggle menu */}
          <span
            className="flex flex-col items-center gap-1 text-xs px-3 py-3 rounded-2xl text-center w-20"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            <HamburgerMenuIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{HINT_LABELS.center}</span>
          </span>
          {/* Right: next page — no right margin so pill sits at screen edge */}
          <span
            className="flex flex-col items-center gap-1 text-xs px-3 py-3 rounded-l-2xl text-center w-20"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              borderRightWidth: 0,
            }}
          >
            <ArrowRightIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{HINT_LABELS.right}</span>
          </span>
        </div>
      )}
      <TocDrawer
        isOpen={isTocOpen}
        entries={tocEntries}
        isLoading={tocLoading}
        error={tocError}
        onSelect={handleSelectTocEntry}
        onClose={handleCloseToc}
      />
      <ReaderSettingsDrawer isOpen={isSettingsOpen} onClose={handleCloseSettings} />
    </div>
  )
}
