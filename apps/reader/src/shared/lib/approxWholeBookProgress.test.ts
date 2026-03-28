import { describe, expect, it } from 'vitest'
import { approxWholeBookProgressFromSpine } from '@/shared/lib/approxWholeBookProgress'

function makeBook(spineItems: { linear?: boolean; index: number; href?: string }[]) {
  return {
    spine: {
      spineItems,
      get(target: string) {
        const t = target.split('#')[0]
        return (
          spineItems.find((s) => s.href === t || t.endsWith('/' + (s.href ?? '')) || (s.href ?? '').endsWith('/' + t)) ??
          null
        )
      },
    },
  }
}

describe('approxWholeBookProgressFromSpine', () => {
  it('returns null when book or href is missing', () => {
    expect(approxWholeBookProgressFromSpine(null, 'a.xhtml', 1, 10)).toBeNull()
    expect(approxWholeBookProgressFromSpine({}, undefined, 1, 10)).toBeNull()
  })

  it('returns null when chapterTotal is not positive', () => {
    const book = makeBook([{ linear: true, index: 0, href: 'a.xhtml' }])
    expect(approxWholeBookProgressFromSpine(book, 'a.xhtml', 1, 0)).toBeNull()
  })

  it('computes midpoint of second linear spine item (1-based page feel)', () => {
    const book = makeBook([
      { linear: true, index: 0, href: 'a.xhtml' },
      { linear: true, index: 1, href: 'b.xhtml' },
      { linear: false, index: 2, href: 'skip.xhtml' },
      { linear: true, index: 3, href: 'c.xhtml' },
    ])
    // second linear item, page 5/10 → index 1 + 0.5 of 3 linear items → 0.5
    expect(approxWholeBookProgressFromSpine(book, 'b.xhtml', 5, 10)).toBeCloseTo(0.5, 5)
  })

  it('matches href with package path suffix', () => {
    const book = makeBook([
      { linear: true, index: 0, href: 'OEBPS/chap.xhtml' },
      { linear: true, index: 1, href: 'OEBPS/end.xhtml' },
    ])
    // First linear spine item, page 1 of 2 → (0 + 0.5) / 2 linear items
    const p = approxWholeBookProgressFromSpine(book, 'OEBPS/chap.xhtml', 1, 2)
    expect(p).toBeCloseTo(0.25, 5)
  })

  it('returns null for non-linear current section', () => {
    const book = makeBook([{ linear: true, index: 0, href: 'a.xhtml' }, { linear: false, index: 1, href: 'b.xhtml' }])
    expect(approxWholeBookProgressFromSpine(book, 'b.xhtml', 1, 5)).toBeNull()
  })
})
