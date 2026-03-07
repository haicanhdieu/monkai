import { describe, it, expect } from 'vitest'
import { bookSchema } from './book.schema'

function makeRawBook(chapters: { pages: { html_content?: string | null; original_html_content?: string | null }[] }[]) {
  return {
    id: 'test-id',
    book_name: 'Test Book',
    category_name: 'Fiction',
    category_seo_name: 'fiction',
    author: 'Test Author',
    chapters,
  }
}

describe('bookSchema – normalizeParagraphs', () => {
  it('AC1 – multi-page chapter: paragraphs from all pages are individually accessible', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: '<p>Sentence one.</p>' },
          { html_content: '<p>Sentence two.</p>' },
          { html_content: '<p>Sentence three.</p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content).toHaveLength(3)
    expect(book.content[0]).toBe('Sentence one.')
    expect(book.content[1]).toBe('Sentence two.')
    expect(book.content[2]).toBe('Sentence three.')
  })

  it('AC2 – no empty paragraphs emitted from short data-pages', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: '<p>Short.</p>' },
          { html_content: '<p>Also short.</p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content.every((p) => p.trim().length > 0)).toBe(true)
  })

  it('AC3 – <p> block tags split into separate paragraph entries', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: '<p>Line A</p><p>Line B</p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content).toContain('Line A')
    expect(book.content).toContain('Line B')
  })

  it('AC3 – <br> splits into separate paragraph entries', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: 'First line<br/>Second line' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content).toContain('First line')
    expect(book.content).toContain('Second line')
  })

  it('AC3 – </div> and </li> also split into separate paragraph entries', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: '<div>Div A</div><div>Div B</div>' },
        ],
      },
    ])

    const divBook = bookSchema.parse(raw)
    expect(divBook.content).toContain('Div A')
    expect(divBook.content).toContain('Div B')

    const liRaw = makeRawBook([
      {
        pages: [
          { html_content: '<ul><li>Item 1</li><li>Item 2</li></ul>' },
        ],
      },
    ])

    const liBook = bookSchema.parse(liRaw)
    expect(liBook.content).toContain('Item 1')
    expect(liBook.content).toContain('Item 2')
  })

  it('AC4 – pages with null html_content produce no output', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: null, original_html_content: null },
          { html_content: '<p>Valid paragraph.</p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content).toHaveLength(1)
    expect(book.content[0]).toBe('Valid paragraph.')
  })

  it('AC4 – pages with empty string html_content produce no output', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: '' },
          { html_content: '<p>Real content.</p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content).toHaveLength(1)
    expect(book.content[0]).toBe('Real content.')
  })

  it('AC4 – whitespace-only html_content produces no output', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: '   ' },
          { html_content: '<p>Actual text.</p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content).toHaveLength(1)
    expect(book.content[0]).toBe('Actual text.')
  })

  it('AC4 – original_html_content fallback used when html_content is null', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: null, original_html_content: '<p>Fallback text.</p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content).toHaveLength(1)
    expect(book.content[0]).toBe('Fallback text.')
  })

  it('AC5 – multi-chapter order: all chapter 1 paragraphs appear before chapter 2', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: '<p>Chap1 Page1</p>' },
          { html_content: '<p>Chap1 Page2</p>' },
        ],
      },
      {
        pages: [
          { html_content: '<p>Chap2 Page1</p>' },
          { html_content: '<p>Chap2 Page2</p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    const idx = (s: string) => book.content.indexOf(s)
    expect(idx('Chap1 Page1')).toBeLessThan(idx('Chap2 Page1'))
    expect(idx('Chap1 Page2')).toBeLessThan(idx('Chap2 Page1'))
    expect(idx('Chap1 Page1')).toBeLessThan(idx('Chap1 Page2'))
  })

  it('HTML entities are decoded – &Agrave; becomes À', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: '<p>&Agrave; la mode</p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content[0]).toBe('À la mode')
  })

  it('excess inline whitespace is collapsed within a paragraph', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: '<p>Word   with   spaces</p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content[0]).toBe('Word with spaces')
  })

  it('inline tags stripped to spaces are collapsed – no double-space artifacts', () => {
    const raw = makeRawBook([
      {
        pages: [
          { html_content: '<p>Hello <strong>world</strong></p>' },
        ],
      },
    ])

    const book = bookSchema.parse(raw)

    expect(book.content[0]).toBe('Hello world')
  })

  it('empty chapters array produces empty content', () => {
    const raw = makeRawBook([])

    const book = bookSchema.parse(raw)

    expect(book.content).toEqual([])
  })

  it('chapter with empty pages array produces no output', () => {
    const raw = makeRawBook([{ pages: [] }])

    const book = bookSchema.parse(raw)

    expect(book.content).toEqual([])
  })
})
