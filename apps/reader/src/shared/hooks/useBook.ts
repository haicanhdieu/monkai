import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/shared/constants/query.keys'
import { staticJsonDataService } from '@/shared/services/data.service'
import { useActiveSource } from '@/shared/stores/useActiveSource'

export function useBook(id: string) {
  const { activeSource } = useActiveSource()
  return useQuery({
    queryKey: queryKeys.book(id, activeSource),
    queryFn: () => staticJsonDataService.getBook(id, activeSource),
    enabled: id.trim().length > 0,
  })
}
