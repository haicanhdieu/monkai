import { useSettingsStore } from '@/stores/settings.store'
import type { ReadingTheme } from '@/stores/settings.store'

const THEME_OPTIONS: { value: ReadingTheme; label: string }[] = [
  { value: 'sepia', label: 'Vàng' },
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
]

export function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore()

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        Giao diện
      </span>
      <div className="flex gap-2">
        {THEME_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
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
  )
}
