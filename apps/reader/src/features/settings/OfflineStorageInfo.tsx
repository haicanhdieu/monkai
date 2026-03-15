import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'
import { useQueryClient } from '@tanstack/react-query'
import { storageService } from '@/shared/services/storage.service'

export function OfflineStorageInfo() {
  const queryClient = useQueryClient()
  const [usedBytes, setUsedBytes] = useState<number | null>(null)
  const [available, setAvailable] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [quotaError, setQuotaError] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [clearError, setClearError] = useState(false)

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
    setClearError(false)
    setClearing(true)
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      queryClient.clear()
      await storageService.clear()
    } catch {
      setClearError(true)
    } finally {
      await loadEstimate()
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
        onClick={() => { setClearError(false); setShowConfirm(true) }}
        disabled={showConfirm || clearing}
        className="self-start rounded-xl px-4 py-3 text-sm font-medium min-h-[44px]"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
      >
        {clearing ? 'Đang xóa…' : 'Xóa bộ nhớ đệm'}
      </button>
      {clearError && (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Xóa thất bại — vui lòng thử lại.
        </p>
      )}
      <Dialog.Root open={showConfirm} onOpenChange={setShowConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-xl"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Dialog.Title
              className="mb-2 text-base font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              Xóa bộ nhớ đệm
            </Dialog.Title>
            <Dialog.Description
              className="mb-6 text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Toàn bộ dữ liệu đã lưu offline (sách, vị trí đọc, dấu trang) sẽ bị xóa. Tiếp tục?
            </Dialog.Description>
            <div className="flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  className="rounded-xl px-4 py-2 text-sm font-medium min-h-[44px]"
                  style={{
                    backgroundColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                >
                  Huỷ
                </button>
              </Dialog.Close>
              <button
                className="rounded-xl px-4 py-2 text-sm font-medium min-h-[44px] text-white"
                style={{ backgroundColor: 'var(--color-accent)' }}
                onClick={() => {
                  setShowConfirm(false)
                  void handleClearCache()
                }}
              >
                Xóa
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
