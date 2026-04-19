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
      className="grid grid-cols-2 gap-2"
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
            className={`rounded-full py-2 text-center text-sm font-semibold transition-colors ${
              isActive
                ? 'text-[var(--color-background)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
            style={
              isActive
                ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' }
                : { border: '1.5px solid var(--color-border)' }
            }
          >
            {source.label}
          </button>
        )
      })}
    </div>
  )
}
