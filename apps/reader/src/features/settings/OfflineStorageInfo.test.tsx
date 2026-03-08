import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OfflineStorageInfo } from './OfflineStorageInfo'

const mockClear = vi.fn()
const mockInvalidateQueries = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    clear: mockClear,
    invalidateQueries: mockInvalidateQueries,
  }),
}))

const mockCachesKeys = vi.fn()
const mockCachesDelete = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockCachesKeys.mockResolvedValue([])
  mockCachesDelete.mockResolvedValue(true)
  Object.defineProperty(globalThis, 'caches', {
    value: { keys: mockCachesKeys, delete: mockCachesDelete },
    writable: true,
    configurable: true,
  })
})

describe('OfflineStorageInfo', () => {
  it('renders storage estimate when navigator.storage.estimate is available', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 5000000, quota: 50000000 }),
      },
    })

    render(<OfflineStorageInfo />)

    await waitFor(() => {
      expect(screen.getByText(/Đã dùng: 4\.8 MB/)).toBeInTheDocument()
    })
  })

  it('renders fallback message when navigator.storage is undefined', async () => {
    vi.stubGlobal('navigator', {
      storage: undefined,
    })

    render(<OfflineStorageInfo />)

    await waitFor(() => {
      expect(screen.getByText('Không thể đọc dung lượng bộ nhớ')).toBeInTheDocument()
    })
  })

  it('"Xóa bộ nhớ đệm" button triggers cache clearing and query clear', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 50000000 }),
      },
    })
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    mockCachesKeys.mockResolvedValue(['book-data', 'precache'])

    render(<OfflineStorageInfo />)

    const button = screen.getByRole('button', { name: /Xóa bộ nhớ đệm/i })
    await user.click(button)

    await waitFor(() => {
      expect(mockCachesKeys).toHaveBeenCalled()
      expect(mockCachesDelete).toHaveBeenCalledWith('book-data')
      expect(mockCachesDelete).toHaveBeenCalledWith('precache')
      expect(mockClear).toHaveBeenCalled()
    })
  })

  it('does not clear cache when user cancels confirm dialog', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 1000, quota: 50000000 }),
      },
    })
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))

    render(<OfflineStorageInfo />)

    await user.click(screen.getByRole('button', { name: /Xóa bộ nhớ đệm/i }))

    expect(mockCachesKeys).not.toHaveBeenCalled()
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('shows quota error message when storage-quota-exceeded event is fired', async () => {
    vi.stubGlobal('navigator', {
      storage: undefined,
    })

    render(<OfflineStorageInfo />)

    act(() => {
      window.dispatchEvent(new CustomEvent('storage-quota-exceeded'))
    })

    await waitFor(() => {
      expect(
        screen.getByText('Bộ nhớ đầy — một số tùy chỉnh không được lưu')
      ).toBeInTheDocument()
    })
  })
})
