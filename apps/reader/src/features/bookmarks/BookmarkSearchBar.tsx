import { MagnifyingGlassIcon, Cross2Icon } from '@radix-ui/react-icons'

interface BookmarkSearchBarProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
}

export function BookmarkSearchBar({ value, onChange, onClear }: BookmarkSearchBarProps) {
  return (
    <div
      className="flex items-center gap-2 rounded-full px-4 py-2 border mb-4"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <MagnifyingGlassIcon
        className="h-4 w-4 shrink-0"
        style={{ color: 'var(--color-text-muted)' }}
        aria-hidden="true"
      />
      <input
        type="search"
        placeholder="Tìm kiếm..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onClear() }}
        enterKeyHint="search"
        className="flex-1 bg-transparent text-sm outline-none focus:ring-0"
        style={{ color: 'var(--color-text)' }}
        aria-label="Tìm kiếm dấu trang"
        data-testid="bookmark-search-input"
      />
      {value ? (
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ color: 'var(--color-text-muted)' }}
          onClick={onClear}
          aria-label="Xóa tìm kiếm"
          data-testid="bookmark-search-clear"
        >
          <Cross2Icon className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
