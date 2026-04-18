import JSZip from 'jszip'
import { describe, it, expect } from 'vitest'
import type { Book } from '@/shared/types/global.types'
import { bookToEpubBuffer } from './bookToEpub'

const BASE_BOOK: Pick<Book, 'source'> = { source: 'vbeta' }

async function unzip(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer)
  const fileNames = Object.keys(zip.files).sort()
  const readFile = async (name: string) => zip.file(name)?.async('string') ?? null
  return { fileNames, readFile, zip }
}

describe('bookToEpubBuffer – multi-chapter structure', () => {
  it('emits one content-*.xhtml and navPoint per chapter when chaptersForEpub is present', async () => {
    const book: Book = {
      ...BASE_BOOK,
      id: 'multi-chapter-book',
      title: 'Multi Chapter Book',
      category: 'Kinh',
      subcategory: 'test',
      translator: 'Tester',
      coverImageUrl: null,
      content: [],
      chaptersForEpub: [
        {
          title: 'Chương 1',
          paragraphs: ['Câu 1', 'Câu 2'],
        },
        {
          title: 'Chương 2',
          paragraphs: ['Câu 3'],
        },
      ],
    }

    const buffer = await bookToEpubBuffer(book)
    const { fileNames, readFile } = await unzip(buffer)

    expect(fileNames).toContain('mimetype')
    expect(fileNames).toContain('META-INF/container.xml')
    expect(fileNames).toContain('OEBPS/content.opf')
    expect(fileNames).toContain('OEBPS/content-1.xhtml')
    expect(fileNames).toContain('OEBPS/content-2.xhtml')
    expect(fileNames).toContain('OEBPS/toc.ncx')

    const tocNcx = await readFile('OEBPS/toc.ncx')
    expect(tocNcx).not.toBeNull()
    expect(tocNcx).toContain('navpoint-1')
    expect(tocNcx).toContain('navpoint-2')
    expect(tocNcx).toContain('Chương 1')
    expect(tocNcx).toContain('Chương 2')
    expect(tocNcx).toContain('content-1.xhtml')
    expect(tocNcx).toContain('content-2.xhtml')
  })

  it('falls back to a single synthetic chapter when chaptersForEpub is missing', async () => {
    const book: Book = {
      ...BASE_BOOK,
      id: 'single-chapter-book',
      title: 'Single Chapter Book',
      category: 'Kinh',
      subcategory: 'test',
      translator: 'Tester',
      coverImageUrl: null,
      content: ['Đoạn 1', 'Đoạn 2'],
    }

    const buffer = await bookToEpubBuffer(book)
    const { fileNames, readFile } = await unzip(buffer)

    expect(fileNames).toContain('OEBPS/content-1.xhtml')
    expect(fileNames).not.toContain('OEBPS/content-2.xhtml')

    const tocNcx = await readFile('OEBPS/toc.ncx')
    expect(tocNcx).not.toBeNull()
    expect(tocNcx).toContain('navpoint-1')
    expect(tocNcx).not.toContain('navpoint-2')
  })

  it('uses chapter.title as the <h1> and <title> in each chapter XHTML', async () => {
    const book: Book = {
      ...BASE_BOOK,
      id: 'named-chapters',
      title: 'Trang Rời Rừng Thiền',
      category: 'Thiền',
      subcategory: 'test',
      translator: 'Tester',
      coverImageUrl: null,
      content: [],
      chaptersForEpub: [
        { title: 'Vào Rừng', paragraphs: ['Đoạn 1'] },
        { title: 'Ra Rừng', paragraphs: ['Đoạn 2'] },
      ],
    }
    const buffer = await bookToEpubBuffer(book)
    const { readFile } = await unzip(buffer)

    const ch1 = await readFile('OEBPS/content-1.xhtml')
    expect(ch1).toContain('<h1>Vào Rừng</h1>')
    expect(ch1).toContain('<title>Vào Rừng</title>')

    const ch2 = await readFile('OEBPS/content-2.xhtml')
    expect(ch2).toContain('<h1>Ra Rừng</h1>')
    expect(ch2).toContain('<title>Ra Rừng</title>')
  })

  it('XML-escapes chapter title in <h1> and <title> when it contains special chars', async () => {
    const book: Book = {
      ...BASE_BOOK,
      id: 'special-chars',
      title: 'Tuyển Tập',
      category: 'Thiền',
      subcategory: 'test',
      translator: 'Tester',
      coverImageUrl: null,
      content: [],
      chaptersForEpub: [
        { title: 'Phật & Người', paragraphs: ['Đoạn 1'] },
        { title: 'Chân <Lý>', paragraphs: ['Đoạn 2'] },
      ],
    }
    const buffer = await bookToEpubBuffer(book)
    const { readFile } = await unzip(buffer)

    const ch1 = await readFile('OEBPS/content-1.xhtml')
    expect(ch1).toContain('<h1>Phật &amp; Người</h1>')
    expect(ch1).toContain('<title>Phật &amp; Người</title>')

    const ch2 = await readFile('OEBPS/content-2.xhtml')
    expect(ch2).toContain('<h1>Chân &lt;Lý&gt;</h1>')
    expect(ch2).toContain('<title>Chân &lt;Lý&gt;</title>')
  })

  it('keeps mimetype file uncompressed (STORE method)', async () => {
    const book: Book = {
      ...BASE_BOOK,
      id: 'test-id',
      title: 'Test Title',
      category: 'Đại Thừa',
      subcategory: 'Test',
      translator: 'Tester',
      coverImageUrl: null,
      content: ['Paragraph one'],
    }

    const buffer = await bookToEpubBuffer(book)
    const { zip } = await unzip(buffer)
    const mimetypeFile = zip.file('mimetype')

    expect(mimetypeFile).toBeDefined()
    const uncompressedBuffer = await mimetypeFile!.async('nodebuffer')
    const mimetypeContent = 'application/epub+zip'
    expect(uncompressedBuffer.toString()).toBe(mimetypeContent)
    expect(uncompressedBuffer.length).toBe(mimetypeContent.length)
  })
})

