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
    <div className="relative h-full w-full overflow-hidden">
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

function GeneratedCover({ id, title }: { id: string; title: string }) {
  const hue = djb2Hash(id) % 360
  const primary = `hsl(${hue}, 45%, 38%)`
  const secondary = `hsl(${(hue + 40) % 360}, 35%, 28%)`
  const initials = title.trim().slice(0, 2).toUpperCase() || '?'

  return (
    <div
      className="h-full w-full flex items-center justify-center select-none"
      style={{ background: `linear-gradient(140deg, ${primary} 0%, ${secondary} 100%)` }}
      data-testid="generated-cover"
      aria-hidden="true"
    >
      <span
        className="font-bold leading-none text-white/80"
        style={{ fontFamily: 'Lora, serif', fontSize: 'clamp(0.75rem, 3cqw, 1.25rem)' }}
      >
        {initials}
      </span>
    </div>
  )
}
