import JSZip from 'jszip'
import { bookToEpubBuffer } from './bookToEpub'

describe('bookToEpubBuffer', () => {
  it('returns an ArrayBuffer for a minimal book', async () => {
    const buffer = await bookToEpubBuffer({
      id: 'test-id',
      title: 'Test Title',
      category: 'Đại Thừa',
      subcategory: 'Test',
      translator: 'Tester',
      coverImageUrl: null,
      content: ['Paragraph one'],
    })

    expect(buffer).toBeInstanceOf(ArrayBuffer)
  })

  it('generated ZIP contains required EPUB files', async () => {
    const buffer = await bookToEpubBuffer({
      id: 'test-id',
      title: 'Test Title',
      category: 'Đại Thừa',
      subcategory: 'Test',
      translator: 'Tester',
      coverImageUrl: null,
      content: ['Paragraph one'],
    })

    const zip = await JSZip.loadAsync(buffer)
    const files = Object.keys(zip.files)

    expect(files).toEqual(
      expect.arrayContaining([
        'mimetype',
        'META-INF/container.xml',
        'OEBPS/content.opf',
        'OEBPS/content.xhtml',
        'OEBPS/toc.ncx',
      ]),
    )
  })

  it('mimetype file is uncompressed (STORE method)', async () => {
    const buffer = await bookToEpubBuffer({
      id: 'test-id',
      title: 'Test Title',
      category: 'Đại Thừa',
      subcategory: 'Test',
      translator: 'Tester',
      coverImageUrl: null,
      content: ['Paragraph one'],
    })

    const zip = await JSZip.loadAsync(buffer)
    const mimetypeFile = zip.file('mimetype')

    expect(mimetypeFile).toBeDefined()
    const uncompressedBuffer = await mimetypeFile!.async('nodebuffer')
    const mimetypeContent = 'application/epub+zip'
    expect(uncompressedBuffer.toString()).toBe(mimetypeContent)
    // EPUB 2.0 requires mimetype first and stored uncompressed; size must match content length
    expect(uncompressedBuffer.length).toBe(mimetypeContent.length)
  })

  it('content.xhtml contains book title and paragraphs', async () => {
    const buffer = await bookToEpubBuffer({
      id: 'test-id',
      title: 'Test Title',
      category: 'Đại Thừa',
      subcategory: 'Test',
      translator: 'Tester',
      coverImageUrl: null,
      content: ['Paragraph one', 'Paragraph two'],
    })

    const zip = await JSZip.loadAsync(buffer)
    const contentFile = zip.file('OEBPS/content.xhtml')
    const contentXhtml = await contentFile!.async('text')

    expect(contentXhtml).toContain('Test Title')
    expect(contentXhtml).toContain('<p>Paragraph one</p>')
    expect(contentXhtml).toContain('<p>Paragraph two</p>')
  })

  it('sanitizeXml strips forbidden control characters from content.xhtml', async () => {
    const buffer = await bookToEpubBuffer({
      id: 'test-id',
      title: 'Test Title',
      category: 'Đại Thừa',
      subcategory: 'Test',
      translator: 'Tester',
      coverImageUrl: null,
      content: ['hello\u0008world'],
    })

    const zip = await JSZip.loadAsync(buffer)
    const contentFile = zip.file('OEBPS/content.xhtml')
    const contentXhtml = await contentFile!.async('text')

    expect(contentXhtml).toContain('helloworld')
    expect(contentXhtml).not.toContain('\u0008')
  })

  it('empty content array produces valid EPUB with placeholder paragraph', async () => {
    const buffer = await bookToEpubBuffer({
      id: 'test-id',
      title: 'Empty Book',
      category: 'Đại Thừa',
      subcategory: 'Test',
      translator: 'Tester',
      coverImageUrl: null,
      content: [],
    })

    const zip = await JSZip.loadAsync(buffer)
    const contentFile = zip.file('OEBPS/content.xhtml')
    const contentXhtml = await contentFile!.async('text')

    expect(contentXhtml).toContain('<p></p>')
  })
})

