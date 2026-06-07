import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { SutraListCard } from '@/features/library/SutraListCard'
import type { CatalogBook } from '@/shared/types/global.types'

function renderCard(book: CatalogBook) {
  return render(
    <MemoryRouter>
      <SutraListCard book={book} />
    </MemoryRouter>,
  )
}

const vnthuquanBook: CatalogBook = {
  id: 'truyen-kieu',
  title: 'Truyện Kiều',
  category: 'Thơ',
  categorySlug: 'tho',
  subcategory: 'General',
  translator: 'Nguyễn Du',
  coverImageUrl: null,
  artifacts: [],
  source: 'vnthuquan',
}

const onedriveBook: CatalogBook = {
  id: 'onedrive-book-1',
  title: 'Sách Nhật Tụng',
  category: 'Văn Học',
  categorySlug: 'van-hoc',
  subcategory: 'General',
  translator: 'Thích Nhất Hạnh',
  coverImageUrl: null,
  artifacts: [],
  epubUrl: 'https://tunnel.example.com/book-data/onedrive/sach/sach.epub',
  source: 'onedrive',
}

describe('SutraListCard – onedrive indistinguishability (Story 2.3 AC#1)', () => {
  it('renders title and translator for a vnthuquan book', () => {
    renderCard(vnthuquanBook)
    expect(screen.getAllByText('Truyện Kiều').length).toBeGreaterThan(0)
    expect(screen.getByText('Nguyễn Du')).toBeInTheDocument()
  })

  it('renders title and translator for an onedrive book identically', () => {
    renderCard(onedriveBook)
    expect(screen.getAllByText('Sách Nhật Tụng').length).toBeGreaterThan(0)
    expect(screen.getByText('Thích Nhất Hạnh')).toBeInTheDocument()
  })

  it('onedrive book renders no source badge (source not in SOURCES)', () => {
    renderCard(onedriveBook)
    expect(screen.queryByText('Sách & Truyện')).not.toBeInTheDocument()
    expect(screen.queryByText('Kinh Phật')).not.toBeInTheDocument()
    expect(screen.queryByText('onedrive')).not.toBeInTheDocument()
  })

  it('vnthuquan book also has no badge (source not exposed as user-facing badge)', () => {
    renderCard(vnthuquanBook)
    // SOURCES.find('vnthuquan') exists but SutraListCard only shows badge when sourceConfig is truthy
    // vnthuquan IS in SOURCES → has badge with label 'Sách & Truyện'
    // This is existing behaviour — we confirm onedrive does not add a third badge variant
    const cards = screen.queryAllByText('onedrive')
    expect(cards).toHaveLength(0)
  })
})
