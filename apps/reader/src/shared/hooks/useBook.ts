import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/shared/constants/query.keys'
import { staticJsonDataService } from '@/shared/services/data.service'
import { useActiveSource } from '@/shared/stores/useActiveSource'
import type { SourceId } from '@/shared/constants/sources'

export function useBook(id: string, sourceOverride?: SourceId) {
  const { activeSource } = useActiveSource()
  const source = sourceOverride ?? activeSource
  return useQuery({
    queryKey: queryKeys.book(id, source),
    queryFn: () => staticJsonDataService.getBook(id, source),
    enabled: id.trim().length > 0,
  })
}
