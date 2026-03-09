import { Link } from 'react-router-dom'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'
import { ROUTES } from '@/shared/constants/routes'
import type { DataErrorCategory } from '@/shared/types/global.types'

const ERROR_MESSAGES: Record<DataErrorCategory, string> = {
  network: 'Nội dung này chưa được tải về. Vui lòng kết nối mạng và thử lại.',
  parse: 'Nội dung kinh bị lỗi định dạng.',
  not_found: 'Không thể tìm thấy nội dung kinh này.',
  unknown: 'Không thể tải nội dung kinh này.',
}

interface ReaderErrorPageProps {
  category?: DataErrorCategory
  isOffline?: boolean
}

export default function ReaderErrorPage({ category = 'unknown', isOffline = false }: ReaderErrorPageProps) {
  const isNetworkOffline = category === 'network' && isOffline
  const message = isNetworkOffline ? ERROR_MESSAGES.network : ERROR_MESSAGES[category]
  const guidance = isNetworkOffline ? OFFLINE_COPY.readerOfflineGuidance : null

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen p-8 text-center"
      style={{ backgroundColor: 'var(--color-background)' }}
      role="region"
      aria-live="polite"
    >
      <p className="text-lg mb-2" style={{ color: 'var(--color-text)' }}>
        {message}
      </p>
      {guidance && (
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
          {guidance}
        </p>
      )}
      <Link
        to={ROUTES.LIBRARY}
        className="text-sm underline mt-6 block"
        style={{ color: 'var(--color-text-muted)' }}
        data-testid="back-to-library"
        aria-label="Về Thư viện"
      >
        ← Về Thư viện
      </Link>
    </div>
  )
}
