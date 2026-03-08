import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useCatalogSync } from '@/shared/hooks/useCatalogSync'

vi.mock('@/shared/hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}))

import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'
const mockUseOnlineStatus = useOnlineStatus as ReturnType<typeof vi.fn>

let broadcastChannelInstance: { addEventListener: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; dispatchMessage: (msg: unknown) => void } | null = null

vi.stubGlobal('BroadcastChannel', class MockBroadcastChannel {
  private listeners: Array<(e: { data: unknown }) => void> = []

  constructor() {
    broadcastChannelInstance = this as typeof broadcastChannelInstance & { addEventListener: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; dispatchMessage: (msg: unknown) => void }
  }

  addEventListener = vi.fn((_type: string, handler: (e: { data: unknown }) => void) => {
    this.listeners.push(handler)
  })

  close = vi.fn()

  dispatchMessage(msg: unknown) {
    this.listeners.forEach((l) => l({ data: msg }))
  }
})

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

beforeEach(() => {
  broadcastChannelInstance = null
  vi.clearAllMocks()
})

describe('useCatalogSync', () => {
  it('does not register BroadcastChannel listener when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false)
    const queryClient = new QueryClient()

    renderHook(() => useCatalogSync(), { wrapper: makeWrapper(queryClient) })

    expect(broadcastChannelInstance).toBeNull()
  })

  it('calls queryClient.invalidateQueries with catalog key on message when online', async () => {
    mockUseOnlineStatus.mockReturnValue(true)
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()

    renderHook(() => useCatalogSync(), { wrapper: makeWrapper(queryClient) })

    expect(broadcastChannelInstance).not.toBeNull()

    broadcastChannelInstance!.dispatchMessage({ type: 'CATALOG_UPDATED' })

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['catalog'] })
    })
  })

  it('closes channel on unmount', () => {
    mockUseOnlineStatus.mockReturnValue(true)
    const queryClient = new QueryClient()

    const { unmount } = renderHook(() => useCatalogSync(), { wrapper: makeWrapper(queryClient) })
    const channelRef = broadcastChannelInstance

    unmount()

    expect(channelRef?.close).toHaveBeenCalled()
  })
})
