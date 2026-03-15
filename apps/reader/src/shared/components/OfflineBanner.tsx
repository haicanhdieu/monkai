import { useEffect, useState } from 'react'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'

const DISMISSED_KEY = 'offline-banner-dismissed'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISSED_KEY) === '1')

  useEffect(() => {
    if (isOnline) {
      setDismissed(false)
      sessionStorage.removeItem(DISMISSED_KEY)
    }
  }, [isOnline])

  if (isOnline || dismissed) return null

  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-40 flex items-start justify-between gap-2 px-4 py-2 text-sm"
      style={{
        backgroundColor: 'var(--color-border)',
        color: 'var(--color-text-muted)',
      }}
    >
      <div className="flex-1 text-center">
        <span>Đang offline — đọc từ bộ nhớ đệm</span>
        <p className="mt-1 text-xs">{OFFLINE_COPY.bannerHint}</p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Đóng thông báo offline"
        className="shrink-0 cursor-pointer border-0 bg-transparent px-1 leading-none"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}
