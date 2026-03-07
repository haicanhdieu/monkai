interface ErrorPageProps {
  title?: string
  description?: string
}

export function ErrorPage({
  title = 'Đã có sự cố kết nối',
  description = 'Không thể tải dữ liệu lúc này. Vui lòng thử lại sau ít phút.',
}: ErrorPageProps) {
  return (
    <section
      className="mx-auto my-6 max-w-xl rounded-xl border p-6 text-center"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      aria-live="polite"
    >
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {description}
      </p>
    </section>
  )
}
