import type { SourceId } from '@/shared/constants/sources'

export const queryKeys = {
  catalog: (source: SourceId) => ['catalog', source] as const,
  book: (id: string, source: SourceId) => ['book', source, id] as const,
  category: (slug: string) => ['category', slug] as const,
}
