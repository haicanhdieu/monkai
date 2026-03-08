import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ROUTES } from '@/shared/constants/routes'
import { BottomNav } from '@/shared/components/BottomNav'

const HomePage = React.lazy(() => import('@/features/home/HomePage'))
const LibraryPage = React.lazy(() => import('@/features/library/LibraryPage'))
const CategoryPage = React.lazy(() => import('@/features/library/CategoryPage'))
const ReaderPage = React.lazy(() => import('@/features/reader/ReaderPage'))
const BookmarksPage = React.lazy(() => import('@/features/bookmarks/BookmarksPage'))
const SettingsPage = React.lazy(() => import('@/features/settings/SettingsPage'))

import { SwUpdateBanner } from '@/shared/components/SwUpdateBanner'
import { OfflineBanner } from '@/shared/components/OfflineBanner'
import { useStorageHydration } from '@/shared/hooks/useStorageHydration'
import { useCatalogSync } from '@/shared/hooks/useCatalogSync'

function AppShell() {
  useStorageHydration()
  useCatalogSync()
  const location = useLocation()
  const isReaderRoute = location.pathname.startsWith('/read/')

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <OfflineBanner />
      <SwUpdateBanner />
      <main className="flex-1 overflow-auto pb-16">
        <Suspense fallback={<div className="p-4">Loading...</div>}>
          <Routes>
            <Route path={ROUTES.HOME} element={<HomePage />} />
            <Route path={ROUTES.LIBRARY} element={<LibraryPage />} />
            <Route path={ROUTES.LIBRARY_CATEGORY} element={<CategoryPage />} />
            <Route path={ROUTES.READ} element={<ReaderPage />} />
            <Route path={ROUTES.BOOKMARKS} element={<BookmarksPage />} />
            <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
            <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
          </Routes>
        </Suspense>
      </main>
      {!isReaderRoute && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.VITE_BASE_PATH ?? '/'}>
      <AppShell />
    </BrowserRouter>
  )
}
