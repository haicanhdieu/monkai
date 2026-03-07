interface SkeletonTextProps {
  lines?: number
  className?: string
}

export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  return (
    <div className={`animate-pulse space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="h-4 rounded"
          style={{ backgroundColor: 'var(--color-border)' }}
          data-testid="skeleton-line"
        />
      ))}
    </div>
  )
}
