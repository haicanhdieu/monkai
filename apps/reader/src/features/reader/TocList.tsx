import type { TocEntry } from './useEpubReader'

interface TocListProps {
  entries: TocEntry[]
  onSelect: (entry: TocEntry) => void
  onClose: () => void
}

export function TocList({ entries, onSelect, onClose }: TocListProps) {
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  return (
    <nav aria-label="Mục lục" role="navigation" className="h-full overflow-y-auto">
      <ul
        className="space-y-1"
        data-testid="toc-list"
        role="list"
        tabIndex={0}
        onKeyDown={handleListKeyDown}
      >
        {entries.map((entry) => (
          <li key={entry.href}>
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded hover:bg-[var(--color-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
              style={{ color: 'var(--color-text)', fontFamily: 'Inter, sans-serif' }}
              onClick={() => onSelect(entry)}
            >
              {entry.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

