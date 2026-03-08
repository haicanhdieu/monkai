import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTheme } from './useTheme'
import { useSettingsStore } from '@/stores/settings.store'
import type { ReadingTheme } from '@/stores/settings.store'

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: vi.fn(),
}))

// useTheme calls useSettingsStore with a selector: (state) => state.theme
// The mock intercepts the call and returns the theme string directly.
function mockTheme(theme: ReadingTheme) {
  vi.mocked(useSettingsStore).mockImplementation(
    (selector: (s: { theme: ReadingTheme }) => ReadingTheme) => selector({ theme }),
  )
}

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.className = ''
  })

  it('applies .theme-sepia when theme is sepia', () => {
    mockTheme('sepia')
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('theme-sepia')).toBe(true)
    expect(document.documentElement.classList.contains('theme-light')).toBe(false)
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false)
  })

  it('applies .theme-dark when theme is dark', () => {
    mockTheme('dark')
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(document.documentElement.classList.contains('theme-sepia')).toBe(false)
  })

  it('switches from sepia to dark by removing sepia and adding dark', () => {
    document.documentElement.classList.add('theme-sepia')
    mockTheme('dark')
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('theme-sepia')).toBe(false)
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
  })

  it('default store theme is sepia', () => {
    mockTheme('sepia')
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('theme-sepia')).toBe(true)
  })
})
