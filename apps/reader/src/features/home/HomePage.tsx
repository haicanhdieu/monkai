import { useState, useRef, useLayoutEffect } from 'react'
import { Link } from 'react-router-dom'
import { ReaderIcon, BookmarkIcon, ChevronRightIcon, PersonIcon } from '@radix-ui/react-icons'
import { AppLogo } from '@/shared/components/AppLogo'
import { ROUTES, toRead } from '@/shared/constants/routes'
import { AppBar } from '@/shared/components/AppBar'
import { coverPlaceholderStyle } from '@/shared/constants/cover'
import { resolveCoverUrl } from '@/shared/services/data.service'
import { useReaderStore } from '@/stores/reader.store'
import { useBook } from '@/shared/hooks/useBook'

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

const COVER_ASPECT_RATIO = 2 / 3

function useCoverDimensions(contentRef: React.RefObject<HTMLDivElement | null>) {
  const [dimensions, setDimensions] = useState<{ height: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return

    const update = () => {
      const height = el.getBoundingClientRect().height
      if (height > 0) {
        setDimensions({ height, width: height * COVER_ASPECT_RATIO })
      }
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [contentRef])

  return dimensions
}

function ContinueReadingCard() {
  const { bookId, bookTitle, currentPage, pages, lastReadTotalPages } = useReaderStore()
  const hasLastRead = bookId !== '' && currentPage > 0
  const { data: bookData } = useBook(hasLastRead ? bookId : '')
  const [coverError, setCoverError] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const coverDimensions = useCoverDimensions(contentRef)

  if (!hasLastRead) return null

  const displayTitle = bookTitle !== '' ? bookTitle : (bookData?.title ?? bookId)
  const coverUrl = bookData?.coverImageUrl ? resolveCoverUrl(bookData.coverImageUrl) : null
  const totalPages =
    pages.length > 0 ? 1 + pages.length : Math.max(1, lastReadTotalPages)
  const progressPercent = totalPages > 0 ? Math.round(((currentPage + 1) / totalPages) * 100) : 0

  return (
    <section className="mb-8 mt-6" aria-label="Tiếp tục đọc">
      <h2
        className="mb-4 text-lg font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Tiếp tục đọc
      </h2>
      <Link
        to={toRead(bookId)}
        className="grid min-h-[44px] grid-cols-[auto_1fr] gap-4 overflow-hidden rounded-xl border px-4 py-4 shadow-sm transition-opacity hover:opacity-95"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        aria-label={`Tiếp tục đọc ${displayTitle}`}
      >
        {/* Cover: when dimensions set, lock size so image cannot extend card; when null, placeholder only (content drives row height). */}
        <div className="flex min-h-0 items-stretch">
          {coverDimensions ? (
            <div
              className="relative shrink-0 overflow-hidden rounded"
              style={{ height: coverDimensions.height, width: coverDimensions.width }}
            >
              {coverUrl && !coverError && (
                <>
                  {!coverLoaded && (
                    <div className="absolute inset-0" style={coverPlaceholderStyle} aria-hidden="true" />
                  )}
                  <img
                    src={coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onLoad={() => setCoverLoaded(true)}
                    onError={() => setCoverError(true)}
                  />
                </>
              )}
              {(!coverUrl || coverError) && (
                <div className="absolute inset-0" style={coverPlaceholderStyle} />
              )}
            </div>
          ) : (
            <div
              className="relative h-full min-h-0 w-full overflow-hidden rounded"
              style={{ aspectRatio: '2/3' }}
            >
              <div className="h-full w-full" style={coverPlaceholderStyle} />
            </div>
          )}
        </div>
        <div ref={contentRef} className="min-h-0 min-w-0">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span
                className="mb-1 inline-block rounded px-2 py-0.5 text-xs font-bold text-white"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                Đang đọc
              </span>
              <h3
                className="text-xl font-bold"
                style={{ fontFamily: 'Lora, serif', color: 'var(--color-text)' }}
              >
                {displayTitle}
              </h3>
            </div>
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-md"
              style={{ backgroundColor: 'var(--color-accent)' }}
              aria-hidden="true"
            >
              <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <div className="mb-2 flex justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <span>Tiến độ: {progressPercent}%</span>
              <span>Trang {currentPage + 1} / {totalPages}</span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--color-border)' }}
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: 'var(--color-accent)',
                }}
              />
            </div>
          </div>
        </div>
      </Link>
    </section>
  )
}

export default function HomePage() {
  return (
    <div className="pb-24">
      <AppBar
        sticky
        title="Trang Chủ"
        leftIcon={<AppLogo />}
        rightSlot={
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
          </span>
        }
      />
      <div className="px-6">
        <div className="mb-8" />

        <ContinueReadingCard />

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
    </div>
  )
}
