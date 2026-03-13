import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/shared/constants/routes'
import { useReaderStore } from '@/stores/reader.store'
import type { Book } from '@/shared/types/global.types'

// TODO: epub.js rewrite in Story 2.2
// ChromelessLayout previously read currentPage, pages, hasSeenHint, and dismissHint
// from reader.store. After the CFI migration (Story 3.1), these fields are removed.
// - hasSeenHint/dismissHint are now local state (chromeless-layout only concern)
// - currentPage and pages are stubbed; page progress will use CFI in Story 2.2
// - isChromeVisible and toggleChrome remain in reader.store

const CHROME_AUTOHIDE_MS = 3000
const FIRST_OPEN_HINT = 'Chạm vào giữa màn hình để hiện menu'

interface ChromelessLayoutProps {
  book: Book
  /** When true, page 0 is the cover/placeholder and totalPages = 1 + content pages. Must be set explicitly by the caller (e.g. reader route passes true). */
  hasCoverPage: boolean
  children: ReactNode
}

export function ChromelessLayout({ book, hasCoverPage, children }: ChromelessLayoutProps) {
  const navigate = useNavigate()
  const { isChromeVisible, toggleChrome, currentPage, totalPages } = useReaderStore()

  // Hint state is a local concern; not persisted in store after CFI migration
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
  }, []) // intentionally runs only on mount; toggleChrome is a stable Zustand action ref

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
          className="text-sm bg-transparent border-none cursor-pointer p-0 font-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
          style={{ color: 'var(--color-text-muted)' }}
          tabIndex={chromeHidden ? -1 : 0}
          aria-label="Về Thư viện"
          data-testid="chrome-back"
        >
          ← Thư viện
        </button>
        <h1
          className="flex-1 text-center text-sm font-medium truncate px-4"
          style={{ color: 'var(--color-text)', fontFamily: 'Inter, sans-serif' }}
        >
          {book.title}
        </h1>
      </div>

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

      {/* First-open hint (AC 3) — shown until first center-tap */}
      {!hasSeenHint && (
        <div
          className="fixed inset-0 z-10 flex items-end justify-center pb-24 pointer-events-none"
          data-testid="chrome-hint"
          aria-hidden="true"
        >
          <span
            className="text-xs px-4 py-2 rounded-full"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            {FIRST_OPEN_HINT}
          </span>
        </div>
      )}
    </div>
  )
}
