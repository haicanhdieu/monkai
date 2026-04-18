export type SourceId = 'vbeta' | 'vnthuquan'

export interface SourceConfig {
  id: SourceId
  label: string
  searchPlaceholder: string
  subtitle: string
  countSuffix: string
  badgeClass: string
}

export const SOURCES: SourceConfig[] = [
  {
    id: 'vbeta',
    label: 'Kinh Phật',
    searchPlaceholder: 'Tìm kiếm kinh điển...',
    subtitle: 'Khám phá kinh điển Phật giáo',
    countSuffix: 'kinh sách',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  },
  {
    id: 'vnthuquan',
    label: 'Sách & Truyện',
    searchPlaceholder: 'Tìm kiếm sách & truyện...',
    subtitle: 'Khám phá kho sách truyện tổng hợp',
    countSuffix: 'cuốn sách',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
]

export const DEFAULT_SOURCE: SourceId = 'vbeta'
