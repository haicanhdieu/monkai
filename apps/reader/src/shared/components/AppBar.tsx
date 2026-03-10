import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface AppBarProps {
  title: string
  backTo?: string
  /** Label for back link when backTo is set (e.g. "Thư viện"). Defaults to "Thư viện". */
  backLabel?: string
  /** Optional class name for the title (e.g. "font-[Lora]" for Settings). */
  titleClassName?: string
  leftIcon?: ReactNode
  rightSlot?: ReactNode
  sticky?: boolean
  /** Rendered below the title row (e.g. LibrarySearchHub). */
  children?: ReactNode
}

export function AppBar({
  title,
  backTo,
  backLabel = 'Thư viện',
  titleClassName,
  leftIcon,
  rightSlot,
  sticky = false,
  children,
}: AppBarProps) {
  const headerClasses = [
    'px-4 pt-4 pb-3',
    sticky && 'sticky top-0 z-20 backdrop-blur',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <header
      className={headerClasses}
      style={{
        backgroundColor: 'var(--color-background)',
      }}
      role="banner"
      aria-label={title}
      data-testid="app-bar"
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {backTo != null ? (
            <Link
              to={backTo}
              className="shrink-0 text-sm"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label={`Quay lại ${backLabel.toLowerCase()}`}
            >
              ← {backLabel}
            </Link>
          ) : leftIcon != null ? (
            <div className="flex shrink-0 items-center" aria-hidden="true">
              {leftIcon}
            </div>
          ) : (
            // Spacer mirrors the standard icon container width (w-8) to keep the title visually balanced when there is no left slot.
            <div className="w-8 shrink-0" aria-hidden="true" />
          )}
          <h1
            className={`min-w-0 flex-1 text-xl font-bold tracking-tight truncate ${titleClassName ?? ''}`.trim()}
            style={{ color: 'var(--color-text)' }}
          >
            {title}
          </h1>
        </div>
        {rightSlot != null ? (
          <div className="flex shrink-0 items-center">
            {rightSlot}
          </div>
        ) : null}
      </div>
      {children != null ? <div className="mt-3">{children}</div> : null}
    </header>
  )
}
