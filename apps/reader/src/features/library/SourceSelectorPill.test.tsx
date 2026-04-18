import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SourceSelectorPill } from '@/features/library/SourceSelectorPill'

const mockSetActiveSource = vi.fn()

vi.mock('@/shared/stores/useActiveSource', () => ({
  useActiveSource: () => ({
    activeSource: 'vbeta',
    setActiveSource: mockSetActiveSource,
  }),
}))

beforeEach(() => {
  mockSetActiveSource.mockReset()
})

describe('SourceSelectorPill', () => {
  it('renders two pill buttons with correct labels', () => {
    render(<SourceSelectorPill />)
    expect(screen.getByRole('button', { name: 'Kinh Phật' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sách & Truyện' })).toBeInTheDocument()
  })

  it('active button has aria-pressed true; inactive has aria-pressed false', () => {
    render(<SourceSelectorPill />)
    expect(screen.getByRole('button', { name: 'Kinh Phật' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sách & Truyện' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking the inactive pill calls setActiveSource with the new source id', async () => {
    render(<SourceSelectorPill />)
    await userEvent.click(screen.getByRole('button', { name: 'Sách & Truyện' }))
    expect(mockSetActiveSource).toHaveBeenCalledWith('vnthuquan')
  })

  it('calls onSourceChange callback when switching to a different source', async () => {
    const onSourceChange = vi.fn()
    render(<SourceSelectorPill onSourceChange={onSourceChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sách & Truyện' }))
    expect(onSourceChange).toHaveBeenCalledOnce()
  })

  it('clicking the already-active pill does NOT call setActiveSource', async () => {
    render(<SourceSelectorPill />)
    await userEvent.click(screen.getByRole('button', { name: 'Kinh Phật' }))
    expect(mockSetActiveSource).not.toHaveBeenCalled()
  })

  it('clicking the already-active pill does NOT call onSourceChange', async () => {
    const onSourceChange = vi.fn()
    render(<SourceSelectorPill onSourceChange={onSourceChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Kinh Phật' }))
    expect(onSourceChange).not.toHaveBeenCalled()
  })
})
