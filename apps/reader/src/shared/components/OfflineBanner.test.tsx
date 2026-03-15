import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineBanner } from '@/shared/components/OfflineBanner'
import { OFFLINE_COPY } from '@/shared/constants/offline.copy'

const mockUseOnlineStatus = vi.fn()
vi.mock('@/shared/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}))

beforeEach(() => {
  sessionStorage.clear()
})

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

  it('shows a close button when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false)
    render(<OfflineBanner />)
    expect(screen.getByRole('button', { name: 'Đóng thông báo offline' })).toBeInTheDocument()
  })

  it('hides banner after clicking close button', async () => {
    const user = userEvent.setup()
    mockUseOnlineStatus.mockReturnValue(false)
    render(<OfflineBanner />)
    await user.click(screen.getByRole('button', { name: 'Đóng thông báo offline' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('banner reappears after going online then offline again', async () => {
    const user = userEvent.setup()
    mockUseOnlineStatus.mockReturnValue(false)
    const { rerender } = render(<OfflineBanner />)
    await user.click(screen.getByRole('button', { name: 'Đóng thông báo offline' }))
    expect(screen.queryByRole('status')).toBeNull()

    // Going online resets dismissed state
    mockUseOnlineStatus.mockReturnValue(true)
    rerender(<OfflineBanner />)
    expect(screen.queryByRole('status')).toBeNull()

    // Going offline again — banner reappears
    mockUseOnlineStatus.mockReturnValue(false)
    rerender(<OfflineBanner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
