import { PersonIcon } from '@radix-ui/react-icons'
import { AppBar } from '@/shared/components/AppBar'
import { AppLogo } from '@/shared/components/AppLogo'
import { FontSizeControl } from './FontSizeControl'
import { ThemeToggle } from './ThemeToggle'
import { OfflineStorageInfo } from './OfflineStorageInfo'

export default function SettingsPage() {
  return (
    <div className="pb-24">
      <AppBar
        title="Cài Đặt"
        leftIcon={<AppLogo />}
        rightSlot={
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
          </span>
        }
      />

      <div className="flex flex-col gap-8 px-6 pt-8">
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
    </div>
  )
}
