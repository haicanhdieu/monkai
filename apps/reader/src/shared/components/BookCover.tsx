import { useState } from 'react'
import { resolveCoverUrl } from '@/shared/services/data.service'

export interface BookCoverProps {
  id: string
  title: string
  coverImageUrl: string | null
}

/**
 * Renders a book cover image, or a deterministic generated cover when no image
 * is available (null URL or broken image).
 *
 * Fills its parent container — wrap in a sized div to control dimensions.
 */
export function BookCover({ id, title, coverImageUrl }: BookCoverProps) {
  const [coverError, setCoverError] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)

  const resolvedUrl = coverImageUrl ? resolveCoverUrl(coverImageUrl) : null
  const showImage = Boolean(resolvedUrl && !coverError)

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ containerType: 'inline-size' }}>
      {showImage ? (
        <>
          {!coverLoaded && (
            <div className="absolute inset-0" aria-hidden="true">
              <GeneratedCover id={id} title={title} />
            </div>
          )}
          <img
            src={resolvedUrl!}
            alt=""
            className="h-full w-full object-cover"
            onLoad={() => setCoverLoaded(true)}
            onError={() => setCoverError(true)}
          />
        </>
      ) : (
        <GeneratedCover id={id} title={title} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internal: deterministic generated cover
// ---------------------------------------------------------------------------

function djb2Hash(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0
  }
  return h
}

function truncateMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const front = Math.ceil((maxLen - 1) / 2)
  const back = maxLen - 1 - front
  return text.slice(0, front) + '…' + text.slice(text.length - back)
}

function GeneratedCover({ id, title }: { id: string; title: string }) {
  const hue = djb2Hash(id) % 360
  const primary = `hsl(${hue}, 45%, 38%)`
  const secondary = `hsl(${(hue + 40) % 360}, 35%, 28%)`

  const displayTitle = truncateMiddle(title.trim(), 40) || '?'

  return (
    <div
      className="h-full w-full flex items-center justify-center select-none p-1"
      style={{ background: `linear-gradient(140deg, ${primary} 0%, ${secondary} 100%)` }}
      data-testid="generated-cover"
      aria-hidden="true"
    >
      <span
        className="font-bold text-white/90 text-center leading-tight overflow-hidden"
        style={{ fontFamily: 'Lora, serif', fontSize: 'clamp(0.45rem, 17cqw, 1.4rem)', wordBreak: 'break-word' }}
      >
        {displayTitle}
      </span>
    </div>
  )
}
