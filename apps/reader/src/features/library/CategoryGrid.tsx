import { Link } from 'react-router-dom'
import type { LibraryCategory } from '@/features/library/library.types'
import { toCategory } from '@/shared/constants/routes'
import { ChevronRightIcon, ReaderIcon } from '@radix-ui/react-icons'

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
          className="group relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-colors hover:brightness-95"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
          aria-label={`${category.displayName} (${category.count} kinh sách)`}
        >
          <div
            className="absolute right-2 top-2 h-16 w-16 rounded-full opacity-20"
            style={{ backgroundColor: 'var(--color-border)' }}
            aria-hidden="true"
          />
          <div
            className="relative z-10 flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'var(--color-background)' }}
            aria-hidden="true"
          >
            <ReaderIcon className="h-5 w-5 text-[var(--color-accent)]" />
          </div>

          <div className="relative z-10">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold">{category.displayName}</h3>
              <ChevronRightIcon className="h-4 w-4 text-[var(--color-text-muted)]" aria-hidden="true" />
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {category.count} kinh sách
            </p>
          </div>
        </Link>
      ))}
    </section>
  )
}
