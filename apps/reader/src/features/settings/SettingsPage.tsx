import { FontSizeControl } from './FontSizeControl'
import { ThemeToggle } from './ThemeToggle'
import { OfflineStorageInfo } from './OfflineStorageInfo'

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8 p-6">
      <h1
        className="text-2xl font-semibold"
        style={{ fontFamily: 'Lora, serif', color: 'var(--color-text)' }}
      >
        Cài Đặt
      </h1>

      <section className="flex flex-col gap-4">
        <FontSizeControl />
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      <section className="flex flex-col gap-4">
        <ThemeToggle />
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      <section className="flex flex-col gap-4">
        <OfflineStorageInfo />
      </section>
    </div>
  )
}
