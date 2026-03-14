import { useEffect, useRef } from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import { useSettingsStore, FONT_SIZE_MIN, FONT_SIZE_MAX } from '@/stores/settings.store'
import type { ReadingTheme } from '@/stores/settings.store'

const THEME_OPTIONS: { value: ReadingTheme; label: string }[] = [
  { value: 'sepia', label: 'Vàng' },
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
]

interface ReaderSettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function ReaderSettingsDrawer({ isOpen, onClose }: ReaderSettingsDrawerProps) {
  // ALL hooks must be called before any early return (Rules of Hooks)
  const firstFocusableRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { fontSize, theme, setFontSize, setTheme } = useSettingsStore()

  useEffect(() => {
    if (!isOpen) return
    firstFocusableRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation() // CRITICAL: prevents ChromelessLayout's toggleChrome() from firing
        onClose()
        return
      }
      // Focus trap: cycle Tab/Shift+Tab within panel focusable elements
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true) // capture so stopPropagation prevents layout's bubble listener
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  // Early return AFTER all hooks
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Cài đặt hiển thị"
      data-testid="settings-drawer"
    >
      {/* Backdrop — flex-1 fills space above panel; captures taps to close */}
      <button
        type="button"
        className="flex-1 bg-black/40"
        aria-label="Đóng cài đặt"
        onClick={onClose}
        data-testid="settings-drawer-backdrop"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className="bg-[var(--color-surface)] rounded-t-2xl border-t border-[var(--color-border)] shadow-xl px-6 pb-8 pt-4"
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-4" data-testid="settings-drawer-handle">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--color-border)' }} />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2
            className="text-sm font-medium"
            style={{ color: 'var(--color-text)', fontFamily: 'Inter, sans-serif' }}
          >
            Hiển thị
          </h2>
          <button
            ref={firstFocusableRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng cài đặt hiển thị"
            className="text-xs bg-transparent border-none cursor-pointer p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Cross2Icon className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {/* Font size row */}
        <div className="flex items-center justify-between mb-6" data-testid="font-size-control">
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>
            Cỡ chữ
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              data-testid="font-decrease"
              aria-label="Giảm cỡ chữ"
              disabled={fontSize <= FONT_SIZE_MIN}
              onClick={() => setFontSize(fontSize - 2)}
              className={`min-h-[44px] min-w-[44px] text-sm font-medium bg-transparent border-none cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${fontSize <= FONT_SIZE_MIN ? 'opacity-40 cursor-not-allowed' : ''}`}
              style={{ color: 'var(--color-text-muted)' }}
            >
              A−
            </button>
            <span
              data-testid="font-size-value"
              className="text-sm w-12 text-center"
              style={{ color: 'var(--color-text)' }}
            >
              {fontSize}px
            </span>
            <button
              type="button"
              data-testid="font-increase"
              aria-label="Tăng cỡ chữ"
              disabled={fontSize >= FONT_SIZE_MAX}
              onClick={() => setFontSize(fontSize + 2)}
              className={`min-h-[44px] min-w-[44px] text-sm font-medium bg-transparent border-none cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${fontSize >= FONT_SIZE_MAX ? 'opacity-40 cursor-not-allowed' : ''}`}
              style={{ color: 'var(--color-text-muted)' }}
            >
              A+
            </button>
          </div>
        </div>
        {/* Theme row */}
        <div data-testid="theme-control">
          <span className="text-sm mb-3 block" style={{ color: 'var(--color-text)' }}>
            Giao diện
          </span>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl text-sm font-medium transition-colors"
                style={
                  theme === value
                    ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-background)' }
                    : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }
                }
                aria-pressed={theme === value}
                aria-label={`Giao diện ${label}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
