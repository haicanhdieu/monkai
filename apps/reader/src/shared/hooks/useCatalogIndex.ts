import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/shared/constants/query.keys'
import { staticJsonDataService } from '@/shared/services/data.service'

export function useCatalogIndex() {
  return useQuery({
    queryKey: queryKeys.catalog(),
    queryFn: () => staticJsonDataService.getCatalog(),
  })
}
