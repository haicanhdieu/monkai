import * as Slider from '@radix-ui/react-slider'
import { useSettingsStore } from '@/stores/settings.store'

export function FontSizeControl() {
  const { fontSize, setFontSize } = useSettingsStore()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          Cỡ chữ:
        </span>
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {fontSize}px
        </span>
      </div>
      <Slider.Root
        className="relative flex min-h-[44px] w-full touch-none select-none items-center"
        min={14}
        max={28}
        step={2}
        value={[fontSize]}
        onValueChange={([value]) => setFontSize(value)}
        aria-label="Cỡ chữ"
      >
        <Slider.Track
          className="relative h-1 grow rounded-full"
          style={{ backgroundColor: 'var(--color-border)' }}
        >
          <Slider.Range
            className="absolute h-full rounded-full"
            style={{ backgroundColor: 'var(--color-accent)' }}
          />
        </Slider.Track>
        <Slider.Thumb
          className="block h-6 w-6 rounded-full shadow focus:outline-none"
          style={{ backgroundColor: 'var(--color-accent)' }}
        />
      </Slider.Root>
      <div className="flex justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span>A</span>
        <span className="text-base">A</span>
      </div>
    </div>
  )
}
