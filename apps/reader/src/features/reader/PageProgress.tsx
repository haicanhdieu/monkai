interface PageProgressProps {
  currentPage: number
  totalPages: number
}

export function PageProgress({ currentPage, totalPages }: PageProgressProps) {
  return null;
  return (
    <p
      className="text-center text-xs select-none"
      style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
      aria-label={`Trang ${currentPage + 1} trên ${totalPages}`}
      data-testid="page-progress"
    >
      {currentPage + 1} / {totalPages}
    </p>
  )
}
