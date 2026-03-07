import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/shared/constants/routes'
import { useReaderStore } from '@/stores/reader.store'
import type { Book } from '@/shared/types/global.types'

const CHROME_AUTOHIDE_MS = 3000
const FIRST_OPEN_HINT = 'Chạm vào giữa màn hình để hiện menu'

interface ChromelessLayoutProps {
  book: Book
  children: ReactNode
}

export function ChromelessLayout({ book, children }: ChromelessLayoutProps) {
  const { isChromeVisible, toggleChrome, hasSeenHint, dismissHint, currentPage, pages } = useReaderStore()
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

  return (
    <div
      className="relative flex flex-col min-h-screen overflow-hidden"
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
        <Link
          to={ROUTES.LIBRARY}
          className="text-sm"
          style={{ color: 'var(--color-text-muted)' }}
          tabIndex={chromeHidden ? -1 : 0}
          aria-label="Về Thư viện"
        >
          ← Thư viện
        </Link>
        <h1
          className="flex-1 text-center text-sm font-medium truncate px-4"
          style={{ color: 'var(--color-text)', fontFamily: 'Inter, sans-serif' }}
        >
          {book.title}
        </h1>
      </div>

      {/* Main reading area */}
      <div className="flex flex-col min-h-screen">{children}</div>

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
          {pages.length > 0 ? `${currentPage + 1} / ${pages.length}` : ''}
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

      {/* First-open hint (AC 3) — shown until first center-tap; persisted in store across route changes */}
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
