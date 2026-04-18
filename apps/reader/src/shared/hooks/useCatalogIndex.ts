import { useQuery } from '@tanstack/react-query'
import type { SourceId } from '@/shared/constants/sources'
import { queryKeys } from '@/shared/constants/query.keys'
import { staticJsonDataService } from '@/shared/services/data.service'

export function useCatalogIndex(source: SourceId) {
  return useQuery({
    queryKey: queryKeys.catalog(source),
    queryFn: () => staticJsonDataService.getCatalog(source),
  })
}
