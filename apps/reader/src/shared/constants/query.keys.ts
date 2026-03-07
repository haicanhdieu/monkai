export const queryKeys = {
  catalog: () => ['catalog'] as const,
  book: (id: string) => ['book', id] as const,
  category: (slug: string) => ['category', slug] as const,
}
