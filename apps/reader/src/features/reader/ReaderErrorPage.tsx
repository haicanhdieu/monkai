import { Link } from 'react-router-dom'
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
}

export default function ReaderErrorPage({ category = 'unknown' }: ReaderErrorPageProps) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen p-8 text-center"
      style={{ backgroundColor: 'var(--color-background)' }}
      role="region"
      aria-live="polite"
    >
      <p className="text-lg mb-6" style={{ color: 'var(--color-text)' }}>
        {ERROR_MESSAGES[category]}
      </p>
      <Link
        to={ROUTES.LIBRARY}
        className="text-sm underline"
        style={{ color: 'var(--color-text-muted)' }}
        data-testid="back-to-library"
      >
        ← Về Thư viện
      </Link>
    </div>
  )
}
