import { SOURCES } from '@/shared/constants/sources'
import type { SourceId } from '@/shared/constants/sources'
import { useActiveSource } from '@/shared/stores/useActiveSource'

interface SourceSelectorPillProps {
  onSourceChange?: () => void
}

export function SourceSelectorPill({ onSourceChange }: SourceSelectorPillProps) {
  const { activeSource, setActiveSource } = useActiveSource()

  function handleSelect(id: SourceId) {
    if (id === activeSource) return
    setActiveSource(id)
    onSourceChange?.()
  }

  return (
    <div
      className="flex gap-1 rounded-full border p-1"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      role="group"
      aria-label="Chọn thư viện"
    >
      {SOURCES.map((source) => {
        const isActive = source.id === activeSource
        return (
          <button
            key={source.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleSelect(source.id)}
            className={`rounded-full px-4 py-1 text-sm font-semibold transition-colors ${
              isActive
                ? 'text-[var(--color-background)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
            style={isActive ? { backgroundColor: 'var(--color-accent)' } : {}}
          >
            {source.label}
          </button>
        )
      })}
    </div>
  )
}
