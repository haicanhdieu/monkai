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

const { mockLocalforageClear } = vi.hoisted(() => ({
  mockLocalforageClear: vi.fn(),
}))
vi.mock('localforage', () => ({
  default: { clear: mockLocalforageClear },
}))

const mockCachesKeys = vi.fn()
const mockCachesDelete = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockCachesKeys.mockResolvedValue([])
  mockCachesDelete.mockResolvedValue(true)
  mockLocalforageClear.mockResolvedValue(undefined)
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

  it('"Xóa bộ nhớ đệm" button opens dialog; confirm clears all caches', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 50000000 }),
      },
    })
    mockCachesKeys.mockResolvedValue(['book-data', 'precache'])

    render(<OfflineStorageInfo />)

    await user.click(screen.getByRole('button', { name: /Xóa bộ nhớ đệm/i }))
    // Dialog should be open — find and click the confirm button
    const confirmBtn = await screen.findByRole('button', { name: /^Xóa$/ })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockCachesKeys).toHaveBeenCalled()
      expect(mockCachesDelete).toHaveBeenCalledWith('book-data')
      expect(mockCachesDelete).toHaveBeenCalledWith('precache')
      expect(mockClear).toHaveBeenCalled()
      expect(mockLocalforageClear).toHaveBeenCalled()
    })
  })

  it('does not clear cache when user cancels dialog', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 1000, quota: 50000000 }),
      },
    })

    render(<OfflineStorageInfo />)

    await user.click(screen.getByRole('button', { name: /Xóa bộ nhớ đệm/i }))
    const cancelBtn = await screen.findByRole('button', { name: /Huỷ/i })
    await user.click(cancelBtn)

    expect(mockCachesKeys).not.toHaveBeenCalled()
    expect(mockClear).not.toHaveBeenCalled()
    expect(mockLocalforageClear).not.toHaveBeenCalled()
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
