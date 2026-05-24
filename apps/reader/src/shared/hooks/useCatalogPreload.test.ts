import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useCatalogPreload } from '@/shared/hooks/useCatalogPreload'
import type { CatalogIndex } from '@/shared/types/global.types'

vi.mock('@/shared/services/storage.service', () => ({
  storageService: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    keys: vi.fn(),
  },
}))

vi.mock('@/shared/stores/useActiveSource', () => ({
  useActiveSource: () => mockActiveSource(),
}))

import { storageService } from '@/shared/services/storage.service'
const mockGetItem = storageService.getItem as ReturnType<typeof vi.fn>

let mockActiveSource = vi.fn()

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const fakeCatalog: CatalogIndex = {
  books: [{ id: 'book-1', title: 'Test', source: 'vnthuquan', artifacts: [], categories: [] }],
} as unknown as CatalogIndex

beforeEach(() => {
  vi.clearAllMocks()
  mockActiveSource = vi.fn().mockReturnValue({ activeSource: 'vnthuquan' })
})

describe('useCatalogPreload', () => {
  it('seeds RQ cache from localforage when cache is empty', async () => {
    mockGetItem.mockResolvedValue(fakeCatalog)
    const queryClient = new QueryClient()
    const setDataSpy = vi.spyOn(queryClient, 'setQueryData')
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()

    renderHook(() => useCatalogPreload(), { wrapper: makeWrapper(queryClient) })

    await act(async () => {
      await vi.waitFor(() => expect(setDataSpy).toHaveBeenCalled())
    })

    expect(setDataSpy).toHaveBeenCalledWith(['catalog', 'vnthuquan'], fakeCatalog)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['catalog', 'vnthuquan'] })
  })

  it('skips seeding when RQ cache already has data', async () => {
    mockGetItem.mockResolvedValue(fakeCatalog)
    const queryClient = new QueryClient()
    queryClient.setQueryData(['catalog', 'vnthuquan'], fakeCatalog)
    const setDataSpy = vi.spyOn(queryClient, 'setQueryData')

    renderHook(() => useCatalogPreload(), { wrapper: makeWrapper(queryClient) })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(setDataSpy).toHaveBeenCalledTimes(0)
  })

  it('does nothing when localforage returns null', async () => {
    mockGetItem.mockResolvedValue(null)
    const queryClient = new QueryClient()
    const setDataSpy = vi.spyOn(queryClient, 'setQueryData')

    renderHook(() => useCatalogPreload(), { wrapper: makeWrapper(queryClient) })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(setDataSpy).not.toHaveBeenCalled()
  })

  it('swallows storage errors without crashing', async () => {
    mockGetItem.mockRejectedValue(new Error('storage unavailable'))
    const queryClient = new QueryClient()
    const setDataSpy = vi.spyOn(queryClient, 'setQueryData')

    expect(() =>
      renderHook(() => useCatalogPreload(), { wrapper: makeWrapper(queryClient) }),
    ).not.toThrow()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(setDataSpy).not.toHaveBeenCalled()
  })

  it('re-seeds when active source changes', async () => {
    const thuvienkinhphatCatalog: CatalogIndex = {
      books: [{ id: 'b2', title: 'Other', source: 'thuvienkinhphat', artifacts: [], categories: [] }],
    } as unknown as CatalogIndex

    mockGetItem
      .mockResolvedValueOnce(fakeCatalog)
      .mockResolvedValueOnce(thuvienkinhphatCatalog)

    mockActiveSource = vi.fn().mockReturnValue({ activeSource: 'vnthuquan' })

    const queryClient = new QueryClient()
    const setDataSpy = vi.spyOn(queryClient, 'setQueryData')
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()

    const { rerender } = renderHook(() => useCatalogPreload(), { wrapper: makeWrapper(queryClient) })

    await act(async () => {
      await vi.waitFor(() => expect(setDataSpy).toHaveBeenCalledWith(['catalog', 'vnthuquan'], fakeCatalog))
    })

    mockActiveSource = vi.fn().mockReturnValue({ activeSource: 'thuvienkinhphat' })
    rerender()

    await act(async () => {
      await vi.waitFor(() =>
        expect(setDataSpy).toHaveBeenCalledWith(['catalog', 'thuvienkinhphat'], thuvienkinhphatCatalog),
      )
    })
  })
})
