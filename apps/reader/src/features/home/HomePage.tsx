import { Link } from 'react-router-dom'
import { ReaderIcon, BookmarkIcon, SunIcon, BellIcon } from '@radix-ui/react-icons'
import { ROUTES, toRead } from '@/shared/constants/routes'

const quickActions = [
  {
    label: 'Kinh Điển',
    to: ROUTES.LIBRARY,
    icon: <ReaderIcon className="h-5 w-5" aria-hidden="true" />,
  },
  {
    label: 'Dấu Trang',
    to: ROUTES.BOOKMARKS,
    icon: <BookmarkIcon className="h-5 w-5" aria-hidden="true" />,
  },
]

export default function HomePage() {
  return (
    <div className="px-6 pb-24 pt-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <SunIcon className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Trang Chủ</h1>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full border"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
          aria-hidden="true"
        >
          <BellIcon className="h-5 w-5" aria-hidden="true" />
        </div>
      </header>

      <section className="mb-8" aria-label="Tiếp tục đọc">
        <h2 className="mb-4 text-lg font-semibold">Tiếp tục đọc</h2>
        <article
          className="overflow-hidden rounded-2xl border"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div
            className="h-36"
            style={{
              background:
                'linear-gradient(140deg, var(--color-border) 0%, var(--color-surface) 55%, var(--color-accent) 100%)',
            }}
          />
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
                  Đang đọc
                </p>
                <p className="text-xl font-semibold" style={{ fontFamily: 'Lora, serif' }}>
                  Kinh Pháp Hoa
                </p>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Chương 2: Phương Tiện
                </p>
              </div>
              <Link
                to={toRead('kinh-phap-hoa')}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                Tiếp tục
              </Link>
            </div>
            <div>
              <div
                className="mb-1 flex items-center justify-between text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <span>Tiến độ 16%</span>
                <span>Trang 14 / 89</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--color-border)' }}
              >
                <div className="h-full w-[16%]" style={{ backgroundColor: 'var(--color-accent)' }} />
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="mb-8" aria-label="Truy cập nhanh">
        <div className="grid grid-cols-2 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-5 text-center transition-colors hover:brightness-95"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--color-background)' }}
              >
                {action.icon}
              </div>
              <span className="text-sm font-semibold">{action.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Lời Phật dạy hôm nay">
        <h2 className="mb-4 text-lg font-semibold">Lời Phật dạy hôm nay</h2>
        <blockquote
          className="rounded-r-xl border-l-4 px-5 py-4 text-sm leading-relaxed italic"
          style={{
            borderColor: 'var(--color-accent)',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          Giữ tâm thanh tịnh, lìa mọi vọng tưởng, ấy là con đường dẫn đến giác ngộ thực thụ.
          <footer className="mt-3 text-xs not-italic font-semibold text-[var(--color-accent)]">
            — Trích Kinh Di Giáo
          </footer>
        </blockquote>
      </section>
    </div>
  )
}
