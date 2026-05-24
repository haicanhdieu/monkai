import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { storageService } from '@/shared/services/storage.service'
import { catalogCacheKey } from '@/shared/constants/storage.keys'
import { queryKeys } from '@/shared/constants/query.keys'
import { useActiveSource } from '@/shared/stores/useActiveSource'
import type { CatalogIndex } from '@/shared/types/global.types'

export function useCatalogPreload() {
  const queryClient = useQueryClient()
  const { activeSource } = useActiveSource()

  useEffect(() => {
    void (async () => {
      try {
        const cached = await storageService.getItem<CatalogIndex>(catalogCacheKey(activeSource))
        if (!cached || !Array.isArray(cached.books)) return
        if (queryClient.getQueryData(queryKeys.catalog(activeSource)) != null) return
        queryClient.setQueryData(queryKeys.catalog(activeSource), cached)
        await queryClient.invalidateQueries({ queryKey: queryKeys.catalog(activeSource) })
      } catch {
        // storage failure — degrade gracefully
      }
    })()
  }, [activeSource, queryClient])
}
