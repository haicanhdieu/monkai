import { Cross2Icon, MagnifyingGlassIcon } from '@radix-ui/react-icons'

interface LibrarySearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  onClear: () => void
}

export function LibrarySearchBar({ query, onQueryChange, onClear }: LibrarySearchBarProps) {
  return (
    <div
      className="flex h-12 items-center rounded-xl border px-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <MagnifyingGlassIcon className="mr-2 h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
      <input
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') onClear() }}
        placeholder="Tìm kiếm kinh điển..."
        enterKeyHint="search"
        className="h-full w-full border-none bg-transparent p-0 text-sm font-medium outline-none focus:ring-0"
        aria-label="Tìm kiếm kinh sách"
      />
      {query ? (
        <button
          type="button"
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ color: 'var(--color-text-muted)' }}
          onClick={onClear}
          aria-label="Xóa từ khóa"
        >
          <Cross2Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
