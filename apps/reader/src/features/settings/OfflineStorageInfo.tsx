import { useState, useEffect } from 'react'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'
import { useQueryClient } from '@tanstack/react-query'

export function OfflineStorageInfo() {
  const queryClient = useQueryClient()
  const [usedBytes, setUsedBytes] = useState<number | null>(null)
  const [available, setAvailable] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [quotaError, setQuotaError] = useState(false)

  async function loadEstimate() {
    if (!navigator.storage?.estimate) {
      setAvailable(false)
      return
    }
    try {
      const { usage } = await navigator.storage.estimate()
      setAvailable(true)
      setUsedBytes(usage ?? 0)
    } catch {
      setAvailable(false)
    }
  }

  useEffect(() => {
    void loadEstimate()
  }, [])

  useEffect(() => {
    const handler = () => setQuotaError(true)
    window.addEventListener('storage-quota-exceeded', handler)
    return () => window.removeEventListener('storage-quota-exceeded', handler)
  }, [])

  async function handleClearCache() {
    if (!window.confirm('Xóa toàn bộ bộ nhớ đệm offline?')) return
    setClearing(true)
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      queryClient.clear()
      await loadEstimate()
    } finally {
      setClearing(false)
    }
  }

  const usedMB = usedBytes !== null ? (usedBytes / (1024 * 1024)).toFixed(1) : null

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        Lưu trữ ngoại tuyến
      </h2>
      {!available ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Không thể đọc dung lượng bộ nhớ
        </p>
      ) : (
        <>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Đã dùng: {usedMB !== null ? `${usedMB} MB` : '…'}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {OFFLINE_COPY.settingsExplanation}
          </p>
        </>
      )}
      {quotaError && (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Bộ nhớ đầy — một số tùy chỉnh không được lưu
        </p>
      )}
      <button
        onClick={() => void handleClearCache()}
        disabled={clearing}
        className="self-start rounded-xl px-4 py-3 text-sm font-medium min-h-[44px]"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
      >
        {clearing ? 'Đang xóa…' : 'Xóa bộ nhớ đệm'}
      </button>
    </div>
  )
}
