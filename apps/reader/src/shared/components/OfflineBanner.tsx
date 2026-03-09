import { OFFLINE_COPY } from '@/shared/constants/offline.copy'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-40 px-4 py-2 text-center text-sm"
      style={{
        backgroundColor: 'var(--color-border)',
        color: 'var(--color-text-muted)',
      }}
    >
      <span>Đang offline — đọc từ bộ nhớ đệm</span>
      <p className="mt-1 text-xs">{OFFLINE_COPY.bannerHint}</p>
    </div>
  )
}
