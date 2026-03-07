export const ROUTES = {
    HOME: '/',
    LIBRARY: '/library',
    LIBRARY_CATEGORY: '/library/:category',
    READ: '/read/:bookId',
    BOOKMARKS: '/bookmarks',
    SETTINGS: '/settings',
} as const

export function toRead(bookId: string): string {
    return `/read/${encodeURIComponent(bookId)}`
}

export function toCategory(category: string): string {
    return `/library/${encodeURIComponent(category)}`
}
