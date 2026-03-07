import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/shared/constants/query.keys'
import { staticJsonDataService } from '@/shared/services/data.service'

export function useBook(id: string) {
  return useQuery({
    queryKey: queryKeys.book(id),
    queryFn: () => staticJsonDataService.getBook(id),
    enabled: id.length > 0,
  })
}
