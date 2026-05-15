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

const { mockLocalforageClear, mockLocalforageKeys, mockLocalforageRemoveItem } = vi.hoisted(() => ({
  mockLocalforageClear: vi.fn(),
  mockLocalforageKeys: vi.fn(),
  mockLocalforageRemoveItem: vi.fn(),
}))
vi.mock('localforage', () => ({
  default: {
    clear: mockLocalforageClear,
    keys: mockLocalforageKeys,
    removeItem: mockLocalforageRemoveItem,
  },
}))

const mockCachesKeys = vi.fn()
const mockCachesDelete = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockCachesKeys.mockResolvedValue([])
  mockCachesDelete.mockResolvedValue(true)
  mockLocalforageClear.mockResolvedValue(undefined)
  mockLocalforageKeys.mockResolvedValue([])
  mockLocalforageRemoveItem.mockResolvedValue(undefined)
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

  it('"Xóa bộ nhớ đệm" button opens dialog; confirm clears only cache keys, not user data', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 50000000 }),
      },
    })
    mockCachesKeys.mockResolvedValue(['book-data', 'precache'])
    mockLocalforageKeys.mockResolvedValue([
      'epub_blob_v4_book-abc',
      'catalog_cache_v1_vnthuquan',
      'book_cache_v1_vnthuquan_book-abc',
      'user_settings',
      'bookmarks',
      'last_read_position',
    ])

    render(<OfflineStorageInfo />)

    await user.click(screen.getByRole('button', { name: /Xóa bộ nhớ đệm/i }))
    const confirmBtn = await screen.findByRole('button', { name: /^Xóa$/ })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockCachesKeys).toHaveBeenCalled()
      expect(mockCachesDelete).toHaveBeenCalledWith('book-data')
      expect(mockCachesDelete).toHaveBeenCalledWith('precache')
      expect(mockClear).toHaveBeenCalled()
      // Only cache-prefixed keys are deleted
      expect(mockLocalforageRemoveItem).toHaveBeenCalledWith('epub_blob_v4_book-abc')
      expect(mockLocalforageRemoveItem).toHaveBeenCalledWith('catalog_cache_v1_vnthuquan')
      // User data and book JSON are NOT deleted
      expect(mockLocalforageRemoveItem).not.toHaveBeenCalledWith('book_cache_v1_vnthuquan_book-abc')
      expect(mockLocalforageRemoveItem).not.toHaveBeenCalledWith('user_settings')
      expect(mockLocalforageRemoveItem).not.toHaveBeenCalledWith('bookmarks')
      expect(mockLocalforageRemoveItem).not.toHaveBeenCalledWith('last_read_position')
      // storageService.clear() must NOT be called
      expect(mockLocalforageClear).not.toHaveBeenCalled()
    })
  })

  it('makes no removeItem calls when storage has no cache-prefixed keys', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 50000000 }),
      },
    })
    mockLocalforageKeys.mockResolvedValue(['user_settings', 'bookmarks', 'last_read_position'])

    render(<OfflineStorageInfo />)

    await user.click(screen.getByRole('button', { name: /Xóa bộ nhớ đệm/i }))
    const confirmBtn = await screen.findByRole('button', { name: /^Xóa$/ })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockLocalforageRemoveItem).not.toHaveBeenCalled()
      expect(mockLocalforageClear).not.toHaveBeenCalled()
      // SW cache and query client are still cleared
      expect(mockCachesKeys).toHaveBeenCalled()
      expect(mockClear).toHaveBeenCalled()
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
    expect(mockLocalforageKeys).not.toHaveBeenCalled()
    expect(mockLocalforageRemoveItem).not.toHaveBeenCalled()
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
