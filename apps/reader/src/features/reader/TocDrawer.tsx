import { useEffect, useRef } from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import type { TocEntry } from './useEpubReader'
import { TocList } from './TocList'

interface TocDrawerProps {
  isOpen: boolean
  entries: TocEntry[]
  isLoading: boolean
  error: Error | null
  onSelect: (entry: TocEntry) => void
  onClose: () => void
}

export function TocDrawer({
  isOpen,
  entries,
  isLoading,
  error,
  onSelect,
  onClose,
}: TocDrawerProps) {
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    firstFocusableRef.current?.focus()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-30 flex"
      aria-modal="true"
      role="dialog"
      aria-label="Mục lục"
      data-testid="toc-drawer"
    >
      <button
        type="button"
        className="flex-1 bg-black/40"
        aria-label="Đóng mục lục"
        onClick={onClose}
        data-testid="toc-drawer-backdrop"
      />
      <div
        className="w-80 max-w-[80vw] h-full bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <h2
            className="text-sm font-medium"
            style={{ color: 'var(--color-text)', fontFamily: 'Inter, sans-serif' }}
          >
            Mục lục
          </h2>
          <button
            ref={firstFocusableRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng mục lục"
            className="text-xs bg-transparent border-none cursor-pointer p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Cross2Icon className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 px-3 py-2 overflow-y-auto">
          {isLoading && (
            <p
              className="text-xs"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
            >
              Đang tải mục lục...
            </p>
          )}
          {!isLoading && error && (
            <p
              className="text-xs"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
            >
              Không tải được mục lục
            </p>
          )}
          {!isLoading && !error && entries.length === 0 && (
            <p
              className="text-xs"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
            >
              Không có mục lục
            </p>
          )}
          {!isLoading && !error && entries.length > 0 && (
            <TocList entries={entries} onSelect={onSelect} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}

