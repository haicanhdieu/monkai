import { useState } from 'react'
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

function ContinueReadingCard() {
  const {
    lastReadBookId,
    lastReadBookTitle,
    lastReadPage,
    lastReadTotalPages,
    lastReadChapterTitle,
    lastReadBookProgressApprox,
  } = useReaderStore()
  const hasLastRead = lastReadBookId !== ''
  const { data: bookData } = useBook(hasLastRead ? lastReadBookId : '')
  const [coverError, setCoverError] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)

  if (!hasLastRead) return null

  const displayTitle =
    lastReadBookTitle !== '' ? lastReadBookTitle : (bookData?.title ?? lastReadBookId)
  const coverUrl = bookData?.coverImageUrl ? resolveCoverUrl(bookData.coverImageUrl) : null
  const totalPages = lastReadTotalPages > 0 ? lastReadTotalPages : 1
  const currentPage = lastReadPage > 0 ? lastReadPage : 1
  const useApproxWholeBook =
    lastReadBookProgressApprox != null &&
    Number.isFinite(lastReadBookProgressApprox) &&
    lastReadBookProgressApprox >= 0 &&
    lastReadBookProgressApprox <= 1
  const progressPercent = useApproxWholeBook
    ? Math.round(lastReadBookProgressApprox * 100)
    : totalPages > 0
      ? Math.round((currentPage / totalPages) * 100)
      : 0

  return (
    <section className="mb-8 mt-6" aria-label="Tiếp tục đọc">
      <h2
        className="mb-4 text-lg font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Tiếp tục đọc
      </h2>
      <Link
        to={toRead(lastReadBookId)}
        className="flex min-h-[44px] gap-4 overflow-hidden rounded-xl border px-4 py-4 shadow-sm transition-opacity hover:opacity-95"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        aria-label={
          useApproxWholeBook
            ? `Tiếp tục đọc ${displayTitle}${lastReadChapterTitle ? `, ${lastReadChapterTitle}` : ''}, khoảng ${progressPercent}% qua sách, trang trong chương ${currentPage}/${totalPages}`
            : `Tiếp tục đọc ${displayTitle}${lastReadChapterTitle ? `, ${lastReadChapterTitle}` : ''}, trang ${currentPage}/${totalPages}`
        }
      >
        {/* Cover: fixed 38% of card width, 2:3 aspect ratio. self-start prevents stretching to content height.
            Flexbox % resolves against the card's definite inline size — no circular grid-auto dependency. */}
        <div
          className="relative w-[38%] flex-none self-start overflow-hidden rounded"
          style={{ aspectRatio: '2/3' }}
          data-testid="continue-reading-cover"
        >
          {coverUrl && !coverError ? (
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
          ) : (
            <div className="h-full w-full" style={coverPlaceholderStyle} />
          )}
        </div>
        <div className="min-w-0 flex-1">
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
            <div className="mb-2 flex justify-end text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <span className="flex items-center gap-1 min-w-0">
                {lastReadChapterTitle && (
                  <>
                    <span className="truncate min-w-0">{lastReadChapterTitle}</span>
                    <span aria-hidden="true" className="shrink-0">|</span>
                  </>
                )}
                <span className="shrink-0">Trang {currentPage} / {totalPages}</span>
              </span>
            </div>
            <div
              className="relative h-4 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--color-border)' }}
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: 'var(--color-accent)',
                }}
              />
              <span
                className="absolute inset-0 flex items-center justify-center text-xs font-semibold"
                style={{ color: '#ffffff' }}
                aria-hidden="true"
              >
                {useApproxWholeBook ? `~${progressPercent}%` : `${progressPercent}%`}
              </span>
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
