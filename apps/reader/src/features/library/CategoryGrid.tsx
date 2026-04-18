import { Link } from 'react-router-dom'
import type { LibraryCategory } from '@/features/library/library.types'
import { toCategory } from '@/shared/constants/routes'
import { ChevronRightIcon } from '@radix-ui/react-icons'

interface CategoryGridProps {
  categories: LibraryCategory[]
  countSuffix?: string
}

export function CategoryGrid({ categories, countSuffix }: CategoryGridProps) {
  const suffix = countSuffix ?? 'kinh sách'
  return (
    <section
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      aria-label="Danh mục thể loại"
      data-testid="category-grid"
    >
      {categories.map((category) => (
        <Link
          key={category.slug}
          to={toCategory(category.slug)}
          className="group flex flex-col rounded-2xl border p-4 transition-colors hover:brightness-95"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
          aria-label={`${category.displayName} (${category.count} ${suffix})`}
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="text-base font-bold">{category.displayName}</h3>
            <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {category.count} {suffix}
          </p>
        </Link>
      ))}
    </section>
  )
}
