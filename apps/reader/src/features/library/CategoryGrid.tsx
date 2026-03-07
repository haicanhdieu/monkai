import { Link } from 'react-router-dom'
import type { LibraryCategory } from '@/features/library/library.types'
import { toCategory } from '@/shared/constants/routes'

interface CategoryGridProps {
  categories: LibraryCategory[]
}

export function CategoryGrid({ categories }: CategoryGridProps) {
  return (
    <section
      className="grid gap-3 sm:grid-cols-2"
      aria-label="Danh mục thể loại"
      data-testid="category-grid"
    >
      {categories.map((category) => (
        <Link
          key={category.slug}
          to={toCategory(category.slug)}
          className="rounded-xl border p-4 min-h-[88px] transition-colors hover:brightness-95"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
          aria-label={`${category.displayName} (${category.count} kinh sách)`}
        >
          <h3 className="font-medium">{category.displayName}</h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {category.count} kinh sách
          </p>
        </Link>
      ))}
    </section>
  )
}
