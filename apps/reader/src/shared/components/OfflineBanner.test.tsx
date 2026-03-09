import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OfflineBanner } from '@/shared/components/OfflineBanner'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'

const mockUseOnlineStatus = vi.fn()
vi.mock('@/shared/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}))

describe('OfflineBanner', () => {
  it('renders nothing when online', () => {
    mockUseOnlineStatus.mockReturnValue(true)
    const { container } = render(<OfflineBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('shows main message and hint when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false)
    render(<OfflineBanner />)
    expect(screen.getByText('Đang offline — đọc từ bộ nhớ đệm')).toBeInTheDocument()
    expect(screen.getByText(OFFLINE_COPY.bannerHint)).toBeInTheDocument()
  })

  it('has role="status" and aria-live="polite" when visible', () => {
    mockUseOnlineStatus.mockReturnValue(false)
    render(<OfflineBanner />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('aria-live', 'polite')
  })
})
