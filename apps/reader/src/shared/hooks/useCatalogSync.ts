import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/shared/constants/query.keys'
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus'

/**
 * Listens for catalog update broadcasts from the SW and invalidates the catalog query.
 * Intentional design: only active when online (AC 4). Catalog invalidation does NOT
 * cascade to individual book queries — query key trees are separate (AC 3).
 */
export function useCatalogSync() {
  const queryClient = useQueryClient()
  const isOnline = useOnlineStatus()

  useEffect(() => {
    if (!isOnline) return
    if (typeof BroadcastChannel === 'undefined') return

    const channel = new BroadcastChannel('catalog-updates')
    channel.addEventListener('message', () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog() })
    })
    return () => channel.close()
  }, [isOnline, queryClient])
}
